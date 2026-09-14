import os

with open("engine/app/rl/gridnexus_env.py", "r", encoding="utf-8") as f:
    code = f.read()

# Replace the incorrect imports on line 36
code = code.replace(
    "from app.schemas.stability import AgentProfile",
    "from app.schemas.stability import SellerProfile"
)

old_profile_init = """            profiles = {}
            for ag in joined_agents:
                out_val = self._surplus[ag] * 0.1
                profiles[ag] = AgentProfile(agent_id=ag, outside_option=out_val)"""

new_profile_init = """            profiles = {}
            for ag in joined_agents:
                out_val = self._surplus[ag] * 0.1
                profiles[ag] = SellerProfile(outside_option=out_val)"""

code = code.replace(old_profile_init, new_profile_init)

with open("engine/app/rl/gridnexus_env.py", "w", encoding="utf-8") as f:
    f.write(code)

print("gridnexus_env.py fixed again.")
