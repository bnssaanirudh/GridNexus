import os
import re

path = 'c:/Users/aniru/Downloads/GridNexus-main/broker/tests/worker.test.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

new_content = content.replace('await enqueueStabilityCheck(["mg-fail-1"]);', 'const job = await enqueueStabilityCheck(["mg-fail-1"]);\n    console.log("Enqueued job:", job?.id);')

with open(path, 'w', encoding='utf-8') as f:
    f.write(new_content)
