import os

with open("engine/app/rl/gridnexus_env.py", "r", encoding="utf-8") as f:
    code = f.read()

# Replace the incorrect imports on line 36
code = code.replace(
    "from app.stability.stability_solver import StabilitySolver, AgentInfo",
    "from app.stability.stability_solver import verify_stability\nfrom app.schemas.stability import AgentProfile\nimport networkx as nx"
)

# Now, in `step`, replace the whole block related to StabilitySolver
old_stability_block = """            solver = StabilitySolver()
            agent_infos = {}
            for ag in joined_agents:
                val = max(0.0, ((0.5 + 0.1 * self._oracle_signal) - self._cost[ag]) * self._surplus[ag])
                agent_infos[ag] = AgentInfo(
                    agent_id=ag,
                    grid_node_id=self._node_mapping[ag],
                    value_contribution=val,
                    constraints=[]
                )
            dev = solver.separation_oracle(agent_infos, set(joined_agents))
            if dev is not None and dev.value > 0:
                coalition_s_cost = min(dev.value, 0.5)"""

new_stability_block = """            profiles = {}
            for ag in joined_agents:
                out_val = self._surplus[ag] * 0.1
                profiles[ag] = AgentProfile(agent_id=ag, outside_option=out_val)
            
            # The exact oracle is fast up to ~12 agents. We limit the graph to agents in the coalition
            g = nx.Graph()
            g.add_nodes_from(joined_agents)
            
            # Surplus map is passed to additive value model
            res = verify_stability(
                coalition=joined_agents,
                graph=g,
                profiles=profiles,
                surplus_map=self._surplus
            )
            
            if not res.is_stable:
                # Epsilon_star > 0 implies blocking coalition
                coalition_s_cost = min(res.epsilon_star, 0.5) if res.epsilon_star > 0 else 0.5"""

code = code.replace(old_stability_block, new_stability_block)

with open("engine/app/rl/gridnexus_env.py", "w", encoding="utf-8") as f:
    f.write(code)

print("gridnexus_env.py fixed.")
