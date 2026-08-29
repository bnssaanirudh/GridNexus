import uuid
import hashlib
import os
from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional, Dict, Any


@dataclass
class RawDocument:
    source_type: str
    content: str
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    ingested_at: datetime = field(default_factory=datetime.utcnow)
    source_name: Optional[str] = None
    source_uri: Optional[str] = None
    publisher: Optional[str] = None
    content_hash: Optional[str] = None
    observed_at: Optional[datetime] = None
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None
    trust_score: Optional[float] = None
    connector_version: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    synthetic: bool = False

    def compute_hash(self):
        self.content_hash = hashlib.sha256(self.content.encode("utf-8")).hexdigest()

class BaseConnector:
    """Base interface for Exogenous Signal connectors."""
    
    def fetch(self, **kwargs) -> List[RawDocument]:
        """Fetch documents from the external source."""
        raise NotImplementedError
        
    def health(self) -> bool:
        """Check if the connector is healthy and ready."""
        raise NotImplementedError
        
    def source_metadata(self) -> Dict[str, Any]:
        """Return metadata about the source."""
        raise NotImplementedError
        
    def validate(self, docs: List[RawDocument]) -> bool:
        """Validate fetched documents."""
        raise NotImplementedError


class WeatherConnector(BaseConnector):
    """
    Weather API Connector.
    If no API key is provided, it does NOT mock data in production.
    """
    VERSION = "1.0.0"

    def __init__(self, api_key: str | None = None, mode: str = "production"):
        self.api_key = api_key or os.getenv("WEATHER_API_KEY")
        self.mode = mode

    def health(self) -> bool:
        if self.mode == "production" and not self.api_key:
            return False
        return True
        
    def source_metadata(self) -> Dict[str, Any]:
        return {
            "source_name": "OpenWeatherMap" if self.api_key else "SyntheticWeather",
            "publisher": "OpenWeather",
            "connector_version": self.VERSION,
            "trust_score": 0.8 if self.api_key else 0.1
        }
        
    def validate(self, docs: List[RawDocument]) -> bool:
        return all(doc.content and len(doc.content) > 0 for doc in docs)

    def fetch(self, query: str = "", **kwargs) -> List[RawDocument]:
        if not self.health():
            raise Exception("EXTERNAL_CONTEXT_UNAVAILABLE: Weather API key missing in production.")
            
        is_synthetic = not self.api_key
        
        # If synthetic mode (test/simulation)
        if is_synthetic:
            docs = [
                RawDocument(
                    source_type="weather",
                    content="Sunny and clear skies. Solar irradiance is high today at 850 W/m2.",
                    source_name="SyntheticWeather",
                    publisher="SimulationEngine",
                    trust_score=0.1,
                    connector_version=self.VERSION,
                    synthetic=True
                )
            ]
            if "storm" in query.lower():
                docs.append(RawDocument(
                    source_type="weather",
                    content="URGENT: Severe storm approaching from the coast. High winds and heavy rain expected to disrupt local grid transmission.",
                    source_name="SyntheticWeather",
                    publisher="SimulationEngine",
                    trust_score=0.1,
                    connector_version=self.VERSION,
                    synthetic=True
                ))
        else:
            # Placeholder for real HTTP call
            docs = []
            
        for d in docs:
            d.compute_hash()
            
        return docs


class GridLoadConnector(BaseConnector):
    """
    Grid Load/Demand Connector (e.g., ISO/RTO data).
    """
    VERSION = "1.0.0"
    
    def __init__(self, api_key: str | None = None, mode: str = "production"):
        self.api_key = api_key or os.getenv("ISO_API_KEY")
        self.mode = mode
        
    def health(self) -> bool:
        if self.mode == "production" and not self.api_key:
            return False
        return True
        
    def source_metadata(self) -> Dict[str, Any]:
        return {
            "source_name": "ISOMarketData",
            "publisher": "Regional ISO",
            "connector_version": self.VERSION,
            "trust_score": 0.9 if self.api_key else 0.1
        }
        
    def validate(self, docs: List[RawDocument]) -> bool:
        return True

    def fetch(self, **kwargs) -> List[RawDocument]:
        if not self.health():
            raise Exception("EXTERNAL_CONTEXT_UNAVAILABLE: ISO API key missing in production.")
            
        is_synthetic = not self.api_key
        if is_synthetic:
            docs = [
                RawDocument(
                    source_type="grid_load",
                    content="Current ISO baseline demand: 45,000 MW. Capacity margin is healthy at 15%.",
                    source_name="SyntheticISO",
                    trust_score=0.1,
                    connector_version=self.VERSION,
                    synthetic=True
                )
            ]
        else:
            docs = []
            
        for d in docs:
            d.compute_hash()
        return docs


class RegulatoryConnector(BaseConnector):
    """
    Regulatory Document Store Connector (e.g., FERC orders, local ordinances).
    """
    VERSION = "1.0.0"
    
    def __init__(self, directory: str | None = None, mode: str = "production"):
        self.directory = directory or os.getenv("REGULATORY_DIR")
        self.mode = mode
        
    def health(self) -> bool:
        if self.mode == "production" and not self.directory:
            return False
        return True
        
    def source_metadata(self) -> Dict[str, Any]:
        return {
            "source_name": "OfficialRegulator",
            "publisher": "Government/FERC",
            "connector_version": self.VERSION,
            "trust_score": 1.0 if self.directory else 0.1
        }
        
    def validate(self, docs: List[RawDocument]) -> bool:
        return True

    def fetch(self, **kwargs) -> List[RawDocument]:
        if not self.health():
            raise Exception("EXTERNAL_CONTEXT_UNAVAILABLE: Regulatory directory missing in production.")
            
        is_synthetic = not self.directory
        if is_synthetic:
            docs = [
                RawDocument(
                    source_type="regulatory",
                    content="FERC Order 2222: Distributed Energy Resources (DERs) are permitted to participate in regional wholesale electricity markets.",
                    source_name="SyntheticRegulator",
                    trust_score=0.1,
                    connector_version=self.VERSION,
                    synthetic=True
                )
            ]
        else:
            docs = []
            
        for d in docs:
            d.compute_hash()
        return docs
