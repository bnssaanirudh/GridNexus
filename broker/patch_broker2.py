import re

with open("src/index.ts", "r") as f:
    content = f.read()

content = content.replace('''      return {
        id: mg.id,
        name: mg.name,
        type: mg.type,
        lat: Number(mg.latitude) || 37.7749,
        lon: Number(mg.longitude) || -122.4194,
        capacity: capacity,
        in_coalition: true,
      };''', '''      return {
        id: mg.id,
        name: mg.name,
        type: mg.type,
        latitude: Number(mg.latitude) || 37.7749,
        longitude: Number(mg.longitude) || -122.4194,
        voltageLevelKv: 11.0,
        capacity: capacity,
        in_coalition: true,
      };''')

content = content.replace('''    const edges = lines.map((l: any) => ({
      id: l.id,
      from: l.fromBusId, // using bus ID directly since we seeded 1-to-1 roughly
      to: l.toBusId,
      capacity_kw: Number(l.thermalLimitKw),
      utilization_kw: Math.random() * 100, // mock dynamic utilization
      utilization_pct: Math.random() * 50
    }));''', '''    const edges = lines.map((l: any) => ({
      id: l.id,
      fromBusId: l.fromBusId,
      toBusId: l.toBusId,
      thermalLimitKw: Number(l.thermalLimitKw),
      resistance: Number(l.resistance),
      reactance: Number(l.reactance),
      active: true,
      utilization: Math.random() * 50
    }));''')

with open("src/index.ts", "w") as f:
    f.write(content)

print("Broker patched 2!")
