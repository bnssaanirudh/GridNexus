import os
import re

files_to_fix = [
    r"command-center\src\components\DashboardShell.tsx",
    r"command-center\src\components\GeoPanel.tsx",
    r"command-center\src\components\HealthPanel.tsx",
    r"command-center\src\components\OracleTimeline.tsx",
    r"command-center\src\components\PowerBIPanel.tsx",
    r"command-center\src\lib\auth.ts",
    r"command-center\src\lib\mockApi.ts",
    r"command-center\src\lib\wsClient.ts",
    r"command-center\src\pages\LandingPage.tsx",
    r"command-center\src\pages\LoginPage.tsx",
    r"command-center\src\pages\OraclePage.tsx",
    r"command-center\vite.config.ts",
]

for file_path in files_to_fix:
    full_path = os.path.join(r"c:\Users\aniru\Downloads\GridNexus-main", file_path)
    with open(full_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Replace various forms of `any` with `unknown`
    content = re.sub(r':\s*any\s*\[\]', r': unknown[]', content)
    content = re.sub(r':\s*any\b', r': unknown', content)
    content = re.sub(r'<\s*any\s*>', r'<unknown>', content)
    content = re.sub(r'<\s*any\s*,', r'<unknown,', content)
    content = re.sub(r',\s*any\s*>', r', unknown>', content)
    content = re.sub(r'Record<string,\s*any\s*>', r'Record<string, unknown>', content)
    content = re.sub(r'\bany\b', r'unknown', content) # Might be risky, let's see. Wait, this might replace variable names or other things. Let's just do it and see if it breaks tests. If it does, we can revert.
    
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content)

# Fix the warning in WorkflowPage by adding exhaustive-deps suppressions where needed or removing them.
wp_path = os.path.join(r"c:\Users\aniru\Downloads\GridNexus-main", r"command-center\src\pages\WorkflowPage.tsx")
with open(wp_path, "r", encoding="utf-8") as f:
    content = f.read()
# Let's remove the // eslint-disable-next-line react-hooks/exhaustive-deps we added earlier to avoid the unused warnings.
content = content.replace("// eslint-disable-next-line react-hooks/exhaustive-deps\n  useEffect(() => {", "useEffect(() => {")
# Just add it only to line 263 or wherever activeModels is used. Actually, let's just let the one warning stay. Or we can fix the deps. 
# "Unused eslint-disable directive" means we disabled it where it wasn't needed.

with open(wp_path, "w", encoding="utf-8") as f:
    f.write(content)
