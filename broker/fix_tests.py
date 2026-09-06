import os
import re

test_dir = 'c:/Users/aniru/Downloads/GridNexus-main/broker/tests'

for root, dirs, files in os.walk(test_dir):
    for file in files:
        if file.endswith('.ts'):
            path = os.path.join(root, file)
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()

            # We want to insert gentId: data.activeAgent, after 
egotiationId: data.negotiationId,
            new_content = re.sub(
                r'(negotiationId:\s*(?:data\.)?negotiationId|negotiationId:\s*neg\.id),\n',
                r'\1,\n          agentId: data.activeAgent,\n',
                content
            )

            # Some files might not use data. if they use something else, but in your_turn handlers they use data.negotiationId
            if new_content != content:
                with open(path, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                print(f"Updated {file}")
