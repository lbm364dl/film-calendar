"""Archive command: move old sessions from live DB to historical JSON."""

from datetime import datetime as _dt

from json_io import read_master_json, write_master_json


def run_archive(args):
    """Move sessions within a date range from the live DB into a historical JSON file."""
    start_date = args.start_date.date()
    end_date = args.end_date.date()
    dry_run = args.dry_run

    if dry_run:
        print(f"[DRY RUN] Archive sessions from {start_date} to {end_date}")
        print(f"  Source : {args.source}")
        print(f"  Output : {args.output}")

    # Load both databases
    live_films = read_master_json(args.source)
    historical_films = read_master_json(args.output)

    # Build historical indices
    def film_fallback_key(film):
        return (
            film.get("title", "").strip().lower(),
            (film.get("director") or "").strip().lower(),
            film.get("year"),
        )

    historical_index_by_url = {}
    historical_index_by_tuple = {}

    for i, f in enumerate(historical_films):
        url = f.get("letterboxd_short_url")
        if url:
            historical_index_by_url[url] = i
        else:
            historical_index_by_tuple[film_fallback_key(f)] = i

    # Partition sessions
    archived_session_count = 0
    kept_session_count = 0
    films_fully_archived = 0
    films_partially_archived = 0
    films_untouched = 0

    new_live_films = []

    for film in live_films:
        sessions = film.get("dates", [])
        in_range = []
        remaining = []

        for session in sessions:
            ts = session.get("timestamp", "")
            try:
                session_date = _dt.fromisoformat(ts).date()
            except (ValueError, TypeError):
                remaining.append(session)
                continue

            if start_date <= session_date <= end_date:
                in_range.append(session)
            else:
                remaining.append(session)

        if not in_range:
            new_live_films.append(film)
            films_untouched += 1
            continue

        # Merge into historical DB
        url = film.get("letterboxd_short_url")
        key = film_fallback_key(film)
        archived_session_count += len(in_range)

        hist_idx = None
        if url and url in historical_index_by_url:
            hist_idx = historical_index_by_url[url]
        elif key in historical_index_by_tuple:
            hist_idx = historical_index_by_tuple[key]

        if hist_idx is not None:
            hist_film = historical_films[hist_idx]
            existing_ts_loc = {
                (s.get("timestamp"), s.get("location"))
                for s in hist_film.get("dates", [])
            }
            for s in in_range:
                if (s.get("timestamp"), s.get("location")) not in existing_ts_loc:
                    hist_film.setdefault("dates", []).append(s)
                    existing_ts_loc.add((s.get("timestamp"), s.get("location")))
        else:
            new_hist_entry = {k: v for k, v in film.items() if k != "dates"}
            new_hist_entry["dates"] = in_range
            historical_films.append(new_hist_entry)
            new_idx = len(historical_films) - 1
            if url:
                historical_index_by_url[url] = new_idx
            else:
                historical_index_by_tuple[key] = new_idx

        # Update live DB
        if remaining:
            updated_film = {k: v for k, v in film.items() if k != "dates"}
            updated_film["dates"] = remaining
            new_live_films.append(updated_film)
            kept_session_count += len(remaining)
            films_partially_archived += 1
        else:
            films_fully_archived += 1

    # Sort historical DB by rating
    historical_films.sort(
        key=lambda f: (f.get("letterboxd_rating") or 0,),
        reverse=True,
    )

    # Print summary
    print(f"\nArchive summary ({start_date} → {end_date}):")
    print(f"  Sessions archived  : {archived_session_count}")
    print(f"  Sessions kept live : {kept_session_count}")
    print(f"  Films fully moved  : {films_fully_archived}")
    print(f"  Films partially moved (still in live DB): {films_partially_archived}")
    print(f"  Films untouched    : {films_untouched}")
    print(f"  Live DB after      : {len(new_live_films)} films")
    print(f"  Historical DB after: {len(historical_films)} films")

    if dry_run:
        print("\n[DRY RUN] No files written.")
        return

    write_master_json(new_live_films, args.source)
    write_master_json(historical_films, args.output)
    print(f"\n✓ Updated live DB   : {args.source}")
    print(f"✓ Updated archive   : {args.output}")
