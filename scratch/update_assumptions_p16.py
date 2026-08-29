with open('docs/ASSUMPTIONS.md', 'a') as f:
    f.write('''
## Prompt 16
- Adversarial tests for stability (falsified willingness, defect after pooling) are implemented by mocking the characteristic function builder (`build_characteristic_function`). This simulates the condition where an agent's true underlying surplus contribution is restricted by the grid topology/capacity, but the agent's inflated demands (falsification) or profitable side-deals (defection) violate the LP feasibility, causing the solver to correctly return `is_stable=False`.
- The malformed offer spam adversary is tested against `negotiate_with_retry` and uses a monkey-patched DQN network (dummy actor) to ensure the fallback executes predictably and the DeficitRegistry bounds the metric without crashing the session.
- The CI job for adversarial tests runs with `--no-cov` to prevent the global 85% coverage threshold from failing the job, since running only 3 test files naturally leaves the rest of the codebase uncovered in that specific run.
''')
