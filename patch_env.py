import ast
import os

with open("engine/app/rl/gridnexus_env.py", "r", encoding="utf-8") as f:
    code = f.read()

new_imports = """
from app.agents.dqn_wrapper import DQNWrapper, NegotiationAction
from app.data.india_spectral_tmy import IndiaSpectralTMYDataset
from app.oracle.llm_oracle import fetch_weather_and_predict_stress
from app.rl.forecasting import get_forecast_error
from app.grid.standard_grids import load_standard_grid
from app.grid.corrective_dispatch import verify_hierarchical
from app.stability.stability_solver import StabilitySolver, AgentInfo
import copy
"""

code = code.replace(
"""from app.agents.dqn_wrapper import DQNWrapper, NegotiationAction
from app.data.india_spectral_tmy import IndiaSpectralTMYDataset
from app.oracle.llm_oracle import fetch_weather_and_predict_stress
from app.rl.forecasting import get_forecast_error""", new_imports.strip())

init_addition = """
        self._tmy_longitude = float(os.getenv("INDIA_TMY_LONGITUDE", "78.9629"))

        self._base_network = load_standard_grid('ieee33')
        self._node_mapping = {}
        non_slack_nodes = [nid for nid, n in self._base_network.nodes.items() if not n.is_slack]
        for i, ag in enumerate(self.possible_agents):
            self._node_mapping[ag] = non_slack_nodes[i % len(non_slack_nodes)]
"""

code = code.replace(
"""        self._tmy_longitude = float(os.getenv("INDIA_TMY_LONGITUDE", "78.9629"))""", init_addition.strip())

step_old = """        # ── 3. Compute rewards ────────────────────────────────────────────
        rewards: dict[str, float] = {}
        physical_costs: dict[str, float] = {}
        stability_costs: dict[str, float] = {}
        for ag in self.agents:
            action = int(actions.get(ag, 1))
            reward, p_cost, s_cost = self._shaped_reward(
                ag, action, coalition_formed, coalition_size
            )
            rewards[ag] = reward
            physical_costs[ag] = p_cost
            stability_costs[ag] = s_cost"""

step_new = """        # ── 3. Evaluate Physical & Stability Constraints ──────────────────
        coalition_p_cost = 0.0
        coalition_s_cost = 0.0
        
        if coalition_formed:
            test_net = copy.deepcopy(self._base_network)
            sellers = joined_agents[:len(joined_agents)//2]
            buyers = joined_agents[len(joined_agents)//2:]
            
            trade_kw = 500.0 / max(len(buyers), 1)
            for s in sellers:
                test_net.nodes[self._node_mapping[s]].p_gen_kw += trade_kw
            for b in buyers:
                test_net.nodes[self._node_mapping[b]].p_load_kw += trade_kw
                
            ok, solver_used, res = verify_hierarchical(test_net)
            if not ok:
                coalition_p_cost = 0.5

            solver = StabilitySolver()
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
                coalition_s_cost = min(dev.value, 0.5)

        # ── 4. Compute rewards ────────────────────────────────────────────
        rewards: dict[str, float] = {}
        physical_costs: dict[str, float] = {}
        stability_costs: dict[str, float] = {}
        for ag in self.agents:
            action = int(actions.get(ag, 1))
            ag_p_cost = coalition_p_cost if ag in joined_agents else 0.0
            ag_s_cost = coalition_s_cost if ag in joined_agents else 0.0
            reward = self._shaped_reward(
                ag, action, coalition_formed, coalition_size, ag_p_cost, ag_s_cost
            )
            rewards[ag] = reward
            physical_costs[ag] = ag_p_cost
            stability_costs[ag] = ag_s_cost"""

code = code.replace(step_old, step_new)


reward_old = """    def _shaped_reward(
        self,
        agent: str,
        action: int,
        coalition_formed: bool,
        coalition_size: int,
    ) -> tuple[float, float, float]:
        \"\"\"
        Utility-driven reward shaping:
        - Trade surplus: reward for ACCEPT relative to own surplus and cost.
        - Switching costs applied when action changes from previous.
        - Grid constraints and blocking coalition penalties via oracle.
        \"\"\"
        surplus = self._surplus[agent]
        cost = self._cost[agent]
        
        switching_cost = 0.05 if self._prev_stances.get(agent, 1) != action else 0.0
        blocking_penalty = 0.5 if (self._oracle_signal > 0.8 and coalition_formed) else 0.0

        # Base trade surplus
        if action == 0: # ACCEPT
            market_price = 0.5 + 0.1 * self._oracle_signal
            trade_surplus = max(0.0, (market_price - cost) * surplus)
            self._cumulative_surplus[agent] += trade_surplus
            self._trade_attempts[agent] += 1
        elif action == 1: # COUNTER_OFFER
            trade_surplus = max(0.0, (0.4 - cost) * surplus * 0.5)
            self._trade_attempts[agent] += 1
        else:  # WALK_AWAY, JOIN, LEAVE
            trade_surplus = 0.0
            if action == 2: # WALK_AWAY
                self._trade_rejections[agent] += 1

        # Simulate physical safety cost (e.g. overvoltage/thermal limit risk)
        physical_cost = 0.2 if (action == 0 and self._oracle_signal > 0.7) else 0.0
        
        # Simulate coalition instability cost (e.g. epsilon-core excess)
        stability_cost = blocking_penalty

        reward = float(trade_surplus - switching_cost - physical_cost - stability_cost)
        return reward, physical_cost, stability_cost"""

reward_new = """    def _shaped_reward(
        self,
        agent: str,
        action: int,
        coalition_formed: bool,
        coalition_size: int,
        physical_cost: float,
        stability_cost: float,
    ) -> float:
        \"\"\"
        Utility-driven reward shaping:
        - Trade surplus: reward for ACCEPT relative to own surplus and cost.
        - Switching costs applied when action changes from previous.
        - Grid constraints and blocking coalition penalties via oracle.
        \"\"\"
        surplus = self._surplus[agent]
        cost = self._cost[agent]
        
        switching_cost = 0.05 if self._prev_stances.get(agent, 1) != action else 0.0

        # Base trade surplus
        if action == 0 or action == 3: # ACCEPT or JOIN
            market_price = 0.5 + 0.1 * self._oracle_signal
            trade_surplus = max(0.0, (market_price - cost) * surplus)
            self._cumulative_surplus[agent] += trade_surplus
            self._trade_attempts[agent] += 1
        elif action == 1: # COUNTER_OFFER
            trade_surplus = max(0.0, (0.4 - cost) * surplus * 0.5)
            self._trade_attempts[agent] += 1
        else:  # WALK_AWAY, LEAVE
            trade_surplus = 0.0
            if action == 2: # WALK_AWAY
                self._trade_rejections[agent] += 1

        reward = float(trade_surplus - switching_cost - physical_cost - stability_cost)
        return reward"""

code = code.replace(reward_old, reward_new)

with open("engine/app/rl/gridnexus_env.py", "w", encoding="utf-8") as f:
    f.write(code)

print("Patched.")
