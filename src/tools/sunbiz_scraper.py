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
        """Search Sunbiz for company information using interactive workflow."""
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
                
                search_button = driver.find_element(By.NAME, "Search")
                search_button.click()
                
                time.sleep(3)
                results = self._select_and_scrape_company_details(driver, company_name)
                
                driver.quit()
                return results
                
            except TimeoutException:
                driver.quit()
                return f"Timeout searching Sunbiz for {company_name}"
                
        except Exception as e:
            return f"Error in Sunbiz interactive search for {company_name}: {str(e)}"
    
    def _select_and_scrape_company_details(self, driver, company_name: str) -> str:
        """Select first active company from results and scrape detailed information."""
        try:
            active_links = driver.find_elements(By.XPATH, "//tr[td[contains(text(), 'Active')]]/td[1]/a")
            
            if not active_links:
                return f"No active companies found for {company_name} in Sunbiz"
            
            first_active = active_links[0]
            company_detail_name = first_active.text
            first_active.click()
            
            time.sleep(2)
            
            details = self._extract_company_details(driver)
            
            return f"Sunbiz data for {company_detail_name}: {details}"
            
        except Exception as e:
            return f"Error selecting company details: {str(e)}"
    
    def _extract_company_details(self, driver) -> dict:
        """Extract detailed company information from Sunbiz detail page."""
        try:
            details = {}
            
            page_text = driver.page_source
            
            if "Document Number:" in page_text:
                details["has_document_number"] = True
            if "Status:" in page_text:
                details["has_status"] = True
            if "Filing Date:" in page_text:
                details["has_filing_date"] = True
                
            details["page_loaded"] = True
            return details
            
        except Exception as e:
            return {"error": str(e)}
