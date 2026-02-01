"""Main entry point for film-calendar."""

from cli import parse_args, generate_cinema_boilerplate
from rate import match_films, rate_films
import pandas as pd
import theaters


def run_scrape(args):
    """Execute the scrape command - fetch films from theaters (no Letterboxd)."""
    start_date = args.start_date
    end_date = args.end_date
    
    if args.fetch_from:
        theaters_list = args.fetch_from
    elif args.period:
        theaters_list = theaters.get_theaters_by_period(args.period)
    else:
        theaters_list = theaters.all_theaters()
    output_csv = args.output

    fetched_films = []
    for theater in theaters_list:
        fetched_films += theaters.fetch_films(theater, start_date, end_date)

    df = (
        pd.DataFrame(fetched_films)
        .drop_duplicates("theater_film_link")
        .sort_values(by="title")
    )
    df = df[~df["title"].isna()]
    df["year"] = pd.to_numeric(df["year"], errors="coerce").astype("Int64")
    
    df.to_csv(output_csv, index=False)
    print(f"\n✓ Scraped {len(df)} films → {output_csv}")
    print(f"  Next: python main.py match --input {output_csv}")


def run_match(args):
    """Execute the match command - find Letterboxd URLs."""
    input_csv = args.input
    output_csv = args.output
    skip_existing = args.skip_existing

    df = pd.read_csv(input_csv)
    df = match_films(df, skip_existing=skip_existing)
    
    df.to_csv(output_csv, index=False)
    matched = df["letterboxd_url"].notna().sum()
    print(f"\n✓ Matched {matched}/{len(df)} films → {output_csv}")
    print(f"  Next: python main.py rate --input {output_csv}")


def run_rate(args):
    """Execute the rate command - fetch ratings from Letterboxd."""
    input_csv = args.input
    output_csv = args.output

    df = pd.read_csv(input_csv)
    df = rate_films(df)
    
    # Sort by rating (best first)
    df = df.sort_values(by="letterboxd_rating", ascending=False)
    
    df.to_csv(output_csv, index=False)
    rated = df["letterboxd_rating"].notna().sum()
    print(f"\n✓ Rated {rated}/{len(df)} films → {output_csv}")


    print(f"\n✓ Rated {rated}/{len(df)} films → {output_csv}")


def run_merge(args):
    """Execute the merge command - merge input CSV into source CSV."""
    source_csv = args.source
    input_csv = args.input
    output_csv = args.output if args.output else source_csv
    
    print(f"Merging {input_csv} into {source_csv} ...")

    source_df = pd.read_csv(source_csv)
    input_df = pd.read_csv(input_csv)
    
    # Ensure keys (links) are strings
    source_df["theater_film_link"] = source_df["theater_film_link"].astype(str)
    input_df["theater_film_link"] = input_df["theater_film_link"].astype(str)
    
    # We will iterate through input_df and merge into source_df
    # We use theater_film_link as the unique key
    
    # Convert source dataframe to a dict of records for easier manipulation
    source_records = {row["theater_film_link"]: row.to_dict() for _, row in source_df.iterrows()}
    
    import json
    import ast
    
    def parse_dates(val):
        """Helper to parse dates column (handle JSON or string repr)."""
        if pd.isna(val):
             return []
        
        parsed = None
        if isinstance(val, str):
            try:
                parsed = json.loads(val)
            except json.JSONDecodeError:
                try:
                    # Fallback for old format or python repr
                    parsed = ast.literal_eval(val)
                except (ValueError, SyntaxError):
                    pass
        else:
            parsed = val # Already a list?

        if isinstance(parsed, list):
            # Validate items
            clean = []
            for item in parsed:
                if isinstance(item, dict) and "timestamp" in item:
                    clean.append(item)
                elif isinstance(item, str):
                    clean.append({"timestamp": item, "location": "Unknown"})
                # If nested list or other weirdness, skip?
            return clean
            
        return []
    
    updated_count = 0
    new_count = 0
    
    for _, input_row in input_df.iterrows():
        key = input_row["theater_film_link"]
        input_record = input_row.to_dict()
        input_dates = parse_dates(input_record.get("dates"))
        
        if key in source_records:
            # Merge existing
            source_record = source_records[key]
            source_dates = parse_dates(source_record.get("dates"))
            
            # Merge dates (deduplicate by tuple content)
            # Both are lists of dicts
            existing_set = {tuple(sorted(d.items())) for d in source_dates}
            new_set = {tuple(sorted(d.items())) for d in input_dates}
            
            if not new_set.issubset(existing_set):
                 merged_set = existing_set.union(new_set)
                 merged_list = [dict(t) for t in merged_set]
                 # Sort by timestamp if possible
                 try:
                     merged_list.sort(key=lambda x: x.get("timestamp", ""))
                 except Exception:
                     pass
                 
                 source_record["dates"] = str(merged_list) # Store as Python literal (single quotes)
                 updated_count += 1
            
            # Update rating info if source is missing it
            if pd.notna(input_record.get("letterboxd_url")) and pd.isna(source_record.get("letterboxd_url")):
                 source_record["letterboxd_url"] = input_record["letterboxd_url"]
                 updated_count += 1
                 
            if pd.notna(input_record.get("letterboxd_rating")):
                 if pd.isna(source_record.get("letterboxd_rating")):
                      source_record["letterboxd_rating"] = input_record["letterboxd_rating"]
                      source_record["letterboxd_viewers"] = input_record.get("letterboxd_viewers")

            # Update year if missing
            if pd.isna(source_record.get("year")) and pd.notna(input_record.get("year")):
                source_record["year"] = input_record["year"]
            
            source_records[key] = source_record # Save back
            
        else:
            # New film
            # Ensure dates are string repr with single quotes
            input_record["dates"] = str(input_dates)
            source_records[key] = input_record
            new_count += 1

    # Reconstruct dataframe
    final_df = pd.DataFrame(list(source_records.values()))
    
    # Ensure column order and types
    if "year" in final_df.columns:
        final_df["year"] = pd.to_numeric(final_df["year"], errors="coerce").astype("Int64")
        
    # Sort by rating (best first) to match user preference
    if "letterboxd_rating" in final_df.columns:
        final_df["letterboxd_rating"] = pd.to_numeric(final_df["letterboxd_rating"], errors="coerce")
        final_df = final_df.sort_values(by="letterboxd_rating", ascending=False)
        
    final_df.to_csv(output_csv, index=False)
    print(f"\n✓ Merged data saved to {output_csv}")
    print(f"  Updates: {updated_count} films modified")
    print(f"  New: {new_count} films added")


def run_new_cinema(args):
    """Execute the new-cinema command."""
    generate_cinema_boilerplate(args.key, args.name, args.url)


if __name__ == "__main__":
    args = parse_args()

    if args.command == "scrape":
        run_scrape(args)
    elif args.command == "match":
        run_match(args)
    elif args.command == "rate":
        run_rate(args)
    elif args.command == "merge":
        run_merge(args)
    elif args.command == "new-cinema":
        run_new_cinema(args)
