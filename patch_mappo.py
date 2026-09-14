import os

with open("engine/app/rl/mappo_trainer.py", "r", encoding="utf-8") as f:
    code = f.read()

old_costs_block = """            # Extract costs if safe_mode is active
            costs = {}
            for ag, inf in infos.items():
                costs[ag] = inf.get("physical_cost", 0.0) + inf.get("stability_cost", 0.0)
                if self.cfg.safe_mode:
                    # In safe mode, we decouple the penalty from the reward
                    rewards[ag] += costs[ag] # undo the penalty applied in env"""

new_costs_block = """            # Extract costs if safe_mode is active
            costs = {}
            physical_costs = {}
            stability_costs = {}
            for ag, inf in infos.items():
                physical_costs[ag] = inf.get("physical_cost", 0.0)
                stability_costs[ag] = inf.get("stability_cost", 0.0)
                costs[ag] = physical_costs[ag] + stability_costs[ag]
                if self.cfg.safe_mode:
                    # In safe mode, we decouple the penalty from the reward
                    rewards[ag] += costs[ag] # undo the penalty applied in env"""

code = code.replace(old_costs_block, new_costs_block)

with open("engine/app/rl/mappo_trainer.py", "w", encoding="utf-8") as f:
    f.write(code)

print("mappo_trainer.py fixed.")
