
import unittest
import sys
from datetime import datetime
from pathlib import Path
from bs4 import BeautifulSoup

# Mock the Scraper to test parsing methods in isolation
class MockGolemScraper:
    def parse_film_director(self, html):
        soup = BeautifulSoup(html, 'html.parser')
        # Logic to find "Dirigida por:"
        director_label = soup.find('td', string=lambda text: text and 'Dirigida por:' in text)
        if director_label:
            director_val = director_label.find_next_sibling('td')
            if director_val:
                text = director_val.get_text(strip=True)
                return text.title()
        return None

    def parse_listing(self, html, date, location_name="Madrid"):
        soup = BeautifulSoup(html, 'html.parser')
        films = []
        
        # Based on day-listing.html analysis
        # Searching for the title links directly might be easiest, then traversing up/down?
        # Title class: "txtNegXXL" inside an "em.txtNegXL"
        
        titles = soup.find_all('a', class_='txtNegXXL')
        for title_tag in titles:
            title = title_tag.get_text(strip=True)
            # Remove (V.O.S.E.) suffix
            title = title.replace(" (V.O.S.E.)", "").strip()
            
            film_url = title_tag['href']
            if not film_url.startswith("http"):
                film_url = f"https://www.golem.es{film_url}" # Basic completion if needed, though they seem absolute in fixture
            
            # Navigate to the container to find showtimes
            # The structure is messy tables. 
            # title_tag -> span -> em -> td -> tr -> tbody -> table (header) 
            # -> td -> tr -> tbody -> table (main film table)
            
            # Use recursive parent search for the wrapping table
            # Line 245: <table ... background="./film-listing_files/golem-madrid">
            
            film_table = title_tag.find_parent('table')
            
            # We need to find the specific table that contains the showtimes too. 
            # The title table is nested inside the main film block table.
            # If we go up enough levels we find the main block.
            
            # Specifically, look for the 'background' attribute or just traverse up until we see showtimes?
            # Let's try to find the 'table' that contains 'CajaVentasSup' classes
            
            # Alternative: find parent table that has a sibling or child table with 'CajaVentasSup'
            
            # Let's go up 4-5 parents
            curr = title_tag
            main_block = None
            for _ in range(6):
                if curr.name == 'table' and curr.find('td', class_='CajaVentasSup'):
                    main_block = curr
                    break
                # Or maybe the parent *contains* the showtimes table
                # Actually, in the HTML, the title table and the showtimes table are SIBLINGS inside a `td`?
                # No:
                # <table ... background="...golem-madrid">
                #   <tr><td bgcolor="#AEAEAE"> ...
                #     <table ...> ... <tr><td bgcolor="#ffffff"> ...
                #       <table ...> ... <tr> ... TITLE at line 251 ... </tr> ... </table>
                #       <table ...> ... <tr> ... SHOWTIMES at line 289 ... </tr> ... </table>
                
                # So the parent with bgcolor="#ffffff" contains both tables.
                # Let's find the parent `td` with `bgcolor="#ffffff"`.
                parent_td = title_tag.find_parent('td', bgcolor="#ffffff")
                if parent_td:
                    main_block = parent_td
                    break
                curr = curr.parent
            
            if not main_block:
                # Try finding by background image in grandparent?
                # The fixture lines 245-247 show the structure.
                continue

            dates = []
            # In `main_block`, find all showtimes
            time_spans = main_block.find_all('span', class_='horaXXXL')
            for span in time_spans:
                a_tag = span.find('a')
                if a_tag:
                    time_str = a_tag.get_text(strip=True)
                    ticket_url = a_tag['href']
                    
                    # Combine date + time
                    full_date = f"{date.strftime('%Y-%m-%d')} {time_str}"
                    dates.append({
                        "timestamp": full_date,
                        "location": location_name,
                        "url_tickets": ticket_url,
                        "url_info": film_url
                    })
            if dates:
                films.append({
                    "title": title,
                    "url": film_url,
                    "dates": dates
                })
            
        return films

class TestGolemParsing(unittest.TestCase):
    def test_parse_director(self):
        fixture_path = Path("tests/fixtures/golem/film-page.html")
        if not fixture_path.exists():
            print(f"Skipping test_parse_director: {fixture_path} not found")
            return
            
        with open(fixture_path, "r", encoding="utf-8") as f:
            html = f.read()
        
        scraper = MockGolemScraper()
        director = scraper.parse_film_director(html)
        self.assertEqual(director, "Hasan Hadi")

    def test_parse_director_uppercase(self):
        # Mock HTML with uppercase director
        html = """
        <html><body><table><tr>
        <td class="txtLectura">Dirigida por:</td>
        <td class="txtLectura">PEDRO ALMODOVAR</td>
        </tr></table></body></html>
        """
        scraper = MockGolemScraper()
        director = scraper.parse_film_director(html)
        self.assertEqual(director, "Pedro Almodovar")

    def test_parse_listing(self):
        fixture_path = Path("tests/fixtures/golem/day-listing.html")
        if not fixture_path.exists():
            self.fail(f"{fixture_path} not found")
            
        with open(fixture_path, "r", encoding="utf-8") as f:
            html = f.read()
            
        scraper = MockGolemScraper()
        date = datetime(2026, 2, 7)
        
        films = scraper.parse_listing(html, date)
        
        self.assertTrue(len(films) > 0, "Should find films")
        
        # Check "La tarta del presidente"
        tarta = next((f for f in films if "La tarta del presidente" in f['title']), None)
        self.assertIsNotNone(tarta)
        self.assertEqual(tarta['title'], "La tarta del presidente") # Strictly check cleaned title
        self.assertEqual(tarta['url'], "https://www.golem.es/golem/pelicula/La-tarta-del-presidente-(V.O.S.E.)")
        self.assertEqual(len(tarta['dates']), 3) # 16:10, 20:20, 22:15
        
        first_date = tarta['dates'][0]
        self.assertEqual(first_date['timestamp'], "2026-02-07 16:10")
        self.assertIn("96032", first_date['url_tickets'])

if __name__ == '__main__':
    unittest.main()
