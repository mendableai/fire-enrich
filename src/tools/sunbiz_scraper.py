import time
from typing import Optional, Dict, Any
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import TimeoutException, NoSuchElementException
from crewai_tools import BaseTool

class SunbizScraperTool(BaseTool):
    name: str = "sunbiz_business_search"
    description: str = "Search Florida business registry (Sunbiz) for company information"
    
    def _run(self, company_name: str, **kwargs) -> str:
        """Search Sunbiz for company information."""
        try:
            options = Options()
            options.add_argument('--headless')
            options.add_argument('--no-sandbox')
            options.add_argument('--disable-dev-shm-usage')
            options.add_argument('--disable-gpu')
            options.add_argument('--window-size=1920,1080')
            
            driver = webdriver.Chrome(options=options)
            driver.get("https://dos.fl.gov/sunbiz/search/")
            
            wait = WebDriverWait(driver, 15)
            
            try:
                name_link = wait.until(EC.element_to_be_clickable((By.LINK_TEXT, "Name")))
                name_link.click()
                
                search_input = wait.until(EC.presence_of_element_located((By.NAME, "SearchTerm")))
                search_input.clear()
                search_input.send_keys(company_name)
                
                search_button = driver.find_element(By.NAME, "Submit")
                search_button.click()
                
                time.sleep(3)
                
                results = self._extract_search_results(driver, company_name)
                
                driver.quit()
                return results
                
            except TimeoutException:
                driver.quit()
                return f"Timeout searching Sunbiz for {company_name}"
                
        except Exception as e:
            return f"Error searching Sunbiz for {company_name}: {str(e)}"
    
    def _extract_search_results(self, driver, company_name: str) -> str:
        """Extract search results from Sunbiz page."""
        try:
            page_source = driver.page_source.lower()
            
            if "no records found" in page_source or "no matches" in page_source:
                return f"No Sunbiz records found for {company_name}"
            
            results_info = {
                "company_searched": company_name,
                "search_completed": True,
                "records_found": "unknown"
            }
            
            try:
                results_table = driver.find_elements(By.TAG_NAME, "table")
                if results_table:
                    results_info["records_found"] = "yes"
                    
                    rows = driver.find_elements(By.TAG_NAME, "tr")
                    if len(rows) > 1:
                        results_info["first_result"] = "found"
                
            except NoSuchElementException:
                pass
            
            return f"Sunbiz search completed for {company_name}. Results: {results_info}"
            
        except Exception as e:
            return f"Error extracting Sunbiz results for {company_name}: {str(e)}"
