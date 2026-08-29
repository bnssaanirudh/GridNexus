from dataclasses import dataclass, field
from typing import Dict, List, Optional
import networkx as nx

@dataclass
class Node:
    id: str
    voltage_level_kv: float
    is_slack: bool = False
    p_load_kw: float = 0.0
    q_load_kvar: float = 0.0
    p_gen_kw: float = 0.0
    q_gen_kvar: float = 0.0
    v_min_pu: float = 0.90
    v_max_pu: float = 1.10

@dataclass
class Line:
    id: str
    from_node: str
    to_node: str
    r_ohms: float
    x_ohms: float
    thermal_limit_kw: float

@dataclass
class ElectricalNetwork:
    nodes: Dict[str, Node] = field(default_factory=dict)
    lines: Dict[str, Line] = field(default_factory=dict)
    base_mva: float = 1.0

    def get_base_kv(self, node_id: str) -> float:
        return self.nodes[node_id].voltage_level_kv

    def get_base_z(self, node_id: str) -> float:
        kv = self.get_base_kv(node_id)
        return (kv ** 2) / self.base_mva

    def to_networkx(self) -> nx.Graph:
        G = nx.Graph()
        for node_id, node in self.nodes.items():
            G.add_node(node_id, **node.__dict__)
        for line_id, line in self.lines.items():
            G.add_edge(line.from_node, line.to_node, id=line_id, **line.__dict__)
        return G
