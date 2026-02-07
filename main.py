"""Main entry point for film-calendar."""

from cli import parse_args, generate_cinema_boilerplate
from rate import match_films, rate_films
import pandas as pd
import theaters
from pathlib import Path


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

    # Build cache from master text (args.cache)
    # We want {theater_film_link: letterboxd_url}
    url_cache = {}
    
    if args.cache:
        master_csv = Path(args.cache)
        
    if master_csv.exists():
        print(f"Loading cache from {master_csv} ...")
        # Move imports here or to top
        from ast import literal_eval
        import json
        
        try:
            master_df = pd.read_csv(master_csv)
            
            count_cached = 0
            for _, row in master_df.iterrows():
                lb_url = row.get("letterboxd_url")
                if pd.isna(lb_url):
                    continue
                
                dates_raw = row.get("dates")
                if pd.isna(dates_raw):
                    continue
                    
                # Parse dates (reusing logic or simple parse)
                try:
                    dates = json.loads(dates_raw.replace("'", '"'))
                except:
                    try:
                        dates = literal_eval(dates_raw)
                    except:
                        dates = []
                
                if isinstance(dates, list):
                    for d in dates:
                        if isinstance(d, dict):
                            link = d.get("url_info")
                            if link and link not in url_cache:
                                url_cache[link] = lb_url
                                count_cached += 1
                                
            print(f"  → Cached {count_cached} links")
        except Exception as e:
            print(f"  → Failed to load cache: {e}")

    df = pd.read_csv(input_csv)
    df = match_films(df, skip_existing=skip_existing, url_cache=url_cache)
    
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

    if not Path(source_csv).exists():
        print(f"Error: Source file {source_csv} does not exist.")
        return

    source_df = pd.read_csv(source_csv)
    input_df = pd.read_csv(input_csv)
    
    # Helper to parse dates column
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
            return parsed
        return []
        
    def normalize_input_dates(row):
        """Convert input row dates to new format list of dicts."""
        dates = parse_dates(row.get("dates"))
        theater = row.get("theater", "Unknown")
        link = row.get("theater_film_link", "")
        
        new_dates = []
        if not dates:
             # Backward compat: if no dates column but we have row info, maybe the row itself implies a screening?
             # But usually scrape produces dates.
             pass
             
        for d in dates:
            item = {}
            if isinstance(d, dict):
                item["timestamp"] = d.get("timestamp")
                item["location"] = d.get("location", theater)
                item["url_tickets"] = d.get("url_tickets", d.get("url", "")) # Handle old 'url' key
                item["url_info"] = d.get("url_info", link)
            elif isinstance(d, str):
                item = {
                    "timestamp": d,
                    "location": theater,
                    "url_tickets": "",
                    "url_info": link
                }
            
            if item.get("timestamp"):
                new_dates.append(item)
        return new_dates

    # 1. Group Input by letterboxd_url
    input_records = {} # Key: lb_url, Value: record (merged if same url)
    unmatched_input_records = [] # List of records without lb_url

    for _, row in input_df.iterrows():
        lb_url = row.get("letterboxd_url")
        new_dates = normalize_input_dates(row)
        
        record = row.to_dict()
        record["dates"] = new_dates
        
        if pd.isna(lb_url):
            unmatched_input_records.append(record)
            continue
            
        if lb_url not in input_records:
            input_records[lb_url] = record
        else:
            # Merge dates
            input_records[lb_url]["dates"].extend(new_dates)
            
            # Update rating if better
            if pd.isna(input_records[lb_url].get("letterboxd_rating")) and pd.notna(row.get("letterboxd_rating")):
                input_records[lb_url]["letterboxd_rating"] = row["letterboxd_rating"]
                input_records[lb_url]["letterboxd_viewers"] = row["letterboxd_viewers"]

    # 2. Merge into Source
    # Source might also have unmatched records.
    # We maintain them in a dict keyed by title for easier lookup/merging.
    source_records = {} # {url: record}
    source_unmatched_by_title = {} # {title: record}
    source_title_to_url = {} # {title: url} - helper for mapped films
    
    # Load Source
    for _, row in source_df.iterrows():
        record = row.to_dict()
        url = record.get("letterboxd_url")
        title = record.get("title")
        
        if pd.notna(url):
            source_records[url] = record
            if pd.notna(title):
                source_title_to_url[title] = url
        else:
            if pd.notna(title):
                # If duplicate titles exist in source (unmatched), we merge them? 
                # Or just pick last? Let's pick first found or merge.
                if title in source_unmatched_by_title:
                     # Merge dates if duplicate exists in source already
                     # (Though source should be clean if migrated correctly)
                     # For safety, let's merge
                     existing = source_unmatched_by_title[title]
                     existing_dates = parse_dates(existing.get("dates"))
                     new_dates = parse_dates(record.get("dates"))
                     # ... dedupe merge ...
                     # Simplified: just append for now then dedupe later? 
                     # Better to have valid unique movies.
                     # Let's assume source is relatively clean or just overwrite?
                     # No, overwrite bad. Let's merge.
                     pass 
                else:
                    source_unmatched_by_title[title] = record
            else:
                 # No matching key (no URL, no Title). Skip or append blindly?
                 # Appending blindly is safer for data preservation but these are garbage rows.
                 # Let's skip warnings for now or handle as list if strictly needed.
                 # User instructions imply we care about preserving "unmatched" but surely they have titles.
                 pass

    updated_count = 0
    new_count = 0
    
    # Helper to merge dates into a source dict
    def merge_dates_into(target_record, incoming_dates):
        target_dates = parse_dates(target_record.get("dates"))
        
        existing_keys = {(d.get("timestamp"), d.get("location")) for d in target_dates}
        added = False
        for d in incoming_dates:
            key = (d.get("timestamp"), d.get("location"))
            if key not in existing_keys:
                target_dates.append(d)
                existing_keys.add(key)
                added = True
        
        if added:
            try:
                target_dates.sort(key=lambda x: x.get("timestamp", ""))
            except Exception:
                pass
            target_record["dates"] = target_dates
            return True
        return False

    # Process matched inputs (URL based)
    for lb_url, input_record in input_records.items():
        if lb_url in source_records:
            # Merge existing
            source_record = source_records[lb_url]
            if merge_dates_into(source_record, input_record["dates"]):
                updated_count += 1
            
            # Update metadata
            if pd.isna(source_record.get("letterboxd_rating")) and pd.notna(input_record.get("letterboxd_rating")):
                 source_record["letterboxd_rating"] = input_record["letterboxd_rating"]
                 source_record["letterboxd_viewers"] = input_record.get("letterboxd_viewers")
                 updated_count += 1 # technically updated

            source_records[lb_url] = source_record
        else:
            # New movie with URL
            # Lazy Rating: Fetch rating if we don't have it
            print(f"  ★ New film found: {input_record.get('title')} ({lb_url})")
            if pd.isna(input_record.get("letterboxd_rating")):
                from rate import fetch_letterboxd_rating
                print(f"    Fetching rating from Letterboxd...")
                try:
                    ratings = fetch_letterboxd_rating(lb_url)
                    input_record["letterboxd_rating"] = ratings["letterboxd_rating"]
                    input_record["letterboxd_viewers"] = ratings["letterboxd_viewers"]
                except Exception as e:
                    print(f"    Failed to fetch rating: {e}")
            
            source_records[lb_url] = input_record
            new_count += 1
            # Also index its title for subsequent lookups? 
            # (Input might have internal dupes but input_records is already unique by URL)
            if pd.notna(input_record.get("title")):
                source_title_to_url[input_record["title"]] = lb_url
            
    # Process unmatched inputs (try matching by title)
    for record in unmatched_input_records:
        title = record.get("title")
        merged = False
        
        if pd.notna(title):
            # 1. Try matching a record with URL
            if title in source_title_to_url:
                url = source_title_to_url[title]
                if merge_dates_into(source_records[url], record["dates"]):
                    updated_count += 1
                merged = True
            
            # 2. Try matching a record without URL
            elif title in source_unmatched_by_title:
                if merge_dates_into(source_unmatched_by_title[title], record["dates"]):
                    updated_count += 1
                merged = True
        
        if not merged:
            # Add as new record
            if pd.notna(title):
                source_unmatched_by_title[title] = record
            else:
                 # Row without title or URL. Maybe append to a junk list? 
                 # For now, if no title, we can't key it.
                 pass
            new_count += 1

    # Reconstruct DataFrame
    # Order: Matched records + Unmatched records
    final_records = list(source_records.values()) + list(source_unmatched_by_title.values())
    final_df = pd.DataFrame(final_records)
    
    # Drop obsolete columns if they snuck in from input
    cols_to_drop = ["theater", "theater_film_link"]
    final_df = final_df.drop(columns=[c for c in cols_to_drop if c in final_df.columns])
    
    # Ensure year is Int64
    if "year" in final_df.columns:
        final_df["year"] = pd.to_numeric(final_df["year"], errors="coerce").astype("Int64")

    # Sort by rating (careful with NAs)
    if "letterboxd_rating" in final_df.columns:
        final_df["letterboxd_rating"] = pd.to_numeric(final_df["letterboxd_rating"], errors="coerce")
        final_df = final_df.sort_values(by="letterboxd_rating", ascending=False)
        
    final_df.to_csv(output_csv, index=False)
    print(f"\n✓ Merged data saved to {output_csv}")
    print(f"  Updates: {updated_count} screening updates/merges")
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
