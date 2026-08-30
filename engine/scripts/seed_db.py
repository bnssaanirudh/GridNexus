import asyncio
import uuid
import sys
import os

# Add engine to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.deps import engine
from app.models import Base, Microgrid, Agent, DER, Bus, Line, MicrogridBusMapping, TopologyRevision
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

async def seed():
    # 1. Create tables
    async with engine.begin() as conn:
        print("Creating tables...")
        await conn.run_sync(Base.metadata.create_all)
        
        # Oracle Signals is not in models.py, create manually
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS oraclesignals (
                id VARCHAR PRIMARY KEY,
                "signalData" JSON,
                "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))

    print("Tables created. Seeding data...")
    
    from app.deps import AsyncSessionLocal
    async with AsyncSessionLocal() as session:
        # Check if already seeded
        res = await session.execute(text("SELECT count(*) FROM microgrids"))
        if res.scalar() > 0:
            print("DB already seeded.")
            return

        # Create Topology
        rev = TopologyRevision(id=str(uuid.uuid4()), notes="Initial Seed")
        session.add(rev)

        # Create Buses & Lines (Simple 2-node grid)
        bus1 = Bus(id="bus-1", externalCode="b1", voltageLevelKv=11.0, latitude=37.7749, longitude=-122.4194)
        bus2 = Bus(id="bus-2", externalCode="b2", voltageLevelKv=11.0, latitude=37.7750, longitude=-122.4195)
        session.add_all([bus1, bus2])
        
        line1 = Line(id="line-1", fromBusId=bus1.id, toBusId=bus2.id, resistance=0.01, reactance=0.05, thermalLimitKw=5000)
        session.add(line1)

        # Create 10 Microgrids & Agents
        for i in range(10):
            mg_id = f"mg-{i}"
            mg = Microgrid(
                id=mg_id,
                name=f"Microgrid {i}",
                type="residential",
                hiddenbatterycapacity="100.0",
                hiddengenerationcost="0.05"
            )
            session.add(mg)
            
            agent = Agent(
                id=f"agent-{i}",
                microgridId=mg_id,
                type="seller" if i % 2 == 0 else "buyer",
                qre_lambda=1.0
            )
            session.add(agent)

            der = DER(
                id=f"der-{i}",
                microgridId=mg_id,
                type="solar_battery",
                ratedPowerKw=50.0,
                energyCapacityKwh=100.0,
                minPowerKw=0.0,
                maxPowerKw=50.0,
                efficiency=0.95,
                currentSoC=0.5,
                maxChargeRateKw=25.0,
                maxDischargeRateKw=25.0,
                cyclicDegradationCost=0.01
            )
            session.add(der)

            mapping = MicrogridBusMapping(
                id=str(uuid.uuid4()),
                microgridId=mg_id,
                busId=bus1.id if i < 5 else bus2.id
            )
            session.add(mapping)

        # Seed Oracle Signals
        await session.execute(text("""
            INSERT INTO oraclesignals (id, "signalData")
            VALUES 
            (:id1, :data1),
            (:id2, :data2)
        """), {
            "id1": str(uuid.uuid4()),
            "data1": '{"signal": "cooperate", "action_id": 1, "confidence": 0.85, "total_pooled_capacity_kwh": 500}',
            "id2": str(uuid.uuid4()),
            "data2": '{"signal": "defect", "action_id": 2, "confidence": 0.60, "total_pooled_capacity_kwh": 200}'
        })

        await session.commit()
        print("Seeding complete.")

if __name__ == "__main__":
    asyncio.run(seed())
