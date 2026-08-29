from sqlalchemy import Column, String, Boolean, Numeric, Integer, ForeignKey, JSON, DateTime
from sqlalchemy.orm import declarative_base, relationship
from sqlalchemy.sql import func
from pgvector.sqlalchemy import Vector

Base = declarative_base()

class Microgrid(Base):
    __tablename__ = "microgrids"
    
    id = Column(String, primary_key=True)
    externalCode = Column(String, unique=True, nullable=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)
    latitude = Column(Numeric(10, 6), nullable=True)
    longitude = Column(Numeric(10, 6), nullable=True)
    active = Column(Boolean, default=True)
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())
    hiddenbatterycapacity = Column(String, nullable=False)
    hiddengenerationcost = Column(String, nullable=False)

    agents = relationship("Agent", back_populates="microgrid")
    ders = relationship("DER", back_populates="microgrid")
    busMappings = relationship("MicrogridBusMapping", back_populates="microgrid")

class Agent(Base):
    __tablename__ = "agents"
    
    id = Column(String, primary_key=True)
    microgridId = Column(String, ForeignKey("microgrids.id"), nullable=False)
    type = Column(String, nullable=False)
    qre_lambda = Column(Numeric(10, 4), nullable=True)
    
    microgrid = relationship("Microgrid", back_populates="agents")

class DER(Base):
    __tablename__ = "ders"
    
    id = Column(String, primary_key=True)
    microgridId = Column(String, ForeignKey("microgrids.id"), nullable=False)
    type = Column(String, nullable=False)
    ratedPowerKw = Column(Numeric(10, 4), nullable=False)
    energyCapacityKwh = Column(Numeric(10, 4), nullable=True)
    minPowerKw = Column(Numeric(10, 4), nullable=False)
    maxPowerKw = Column(Numeric(10, 4), nullable=False)
    efficiency = Column(Numeric(5, 4), nullable=False)
    metadata = Column(JSON, nullable=True)
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    microgrid = relationship("Microgrid", back_populates="ders")

class Bus(Base):
    __tablename__ = "buses"
    
    id = Column(String, primary_key=True)
    externalCode = Column(String, unique=True, nullable=True)
    voltageLevelKv = Column(Numeric(10, 4), nullable=False)
    latitude = Column(Numeric(10, 6), nullable=True)
    longitude = Column(Numeric(10, 6), nullable=True)

    linesFrom = relationship("Line", foreign_keys="[Line.fromBusId]", back_populates="fromBus")
    linesTo = relationship("Line", foreign_keys="[Line.toBusId]", back_populates="toBus")
    microgrids = relationship("MicrogridBusMapping", back_populates="bus")

class Line(Base):
    __tablename__ = "lines"
    
    id = Column(String, primary_key=True)
    fromBusId = Column(String, ForeignKey("buses.id"), nullable=False)
    toBusId = Column(String, ForeignKey("buses.id"), nullable=False)
    resistance = Column(Numeric(10, 6), nullable=False)
    reactance = Column(Numeric(10, 6), nullable=False)
    thermalLimitKw = Column(Numeric(10, 4), nullable=False)
    active = Column(Boolean, default=True)
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    fromBus = relationship("Bus", foreign_keys=[fromBusId], back_populates="linesFrom")
    toBus = relationship("Bus", foreign_keys=[toBusId], back_populates="linesTo")

class MicrogridBusMapping(Base):
    __tablename__ = "microgrid_bus_mappings"
    
    id = Column(String, primary_key=True)
    microgridId = Column(String, ForeignKey("microgrids.id"), nullable=False)
    busId = Column(String, ForeignKey("buses.id"), nullable=False)
    phase = Column(String, nullable=True)
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    microgrid = relationship("Microgrid", back_populates="busMappings")
    bus = relationship("Bus", back_populates="microgrids")

class TopologyRevision(Base):
    __tablename__ = "topology_revisions"

    id = Column(String, primary_key=True)
    version = Column(Integer, unique=True, autoincrement=True)
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    notes = Column(String, nullable=True)


class User(Base):
    """Platform user for JWT authentication and RBAC."""
    __tablename__ = "users"

    id              = Column(String, primary_key=True)
    username        = Column(String(50),  unique=True, nullable=False, index=True)
    email           = Column(String(200), unique=True, nullable=False, index=True)
    hashed_password = Column(String,      nullable=False)
    role            = Column(String(30),  nullable=False, default="researcher")
    is_active       = Column(Boolean,     nullable=False, default=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
