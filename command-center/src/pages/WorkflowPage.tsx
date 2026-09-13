import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type WheelEvent } from "react";
import "./WorkflowPage.css";

const WORLD = { width: 1280, height: 760 };

type Point = { x: number; y: number };
type NodeKind = "source" | "service" | "agent" | "solver" | "ledger" | "interface";
type TopologyNode = { id: string; label: string; x: number; y: number; kind: NodeKind; seller?: boolean; group?: number };
type Camera = { x: number; y: number; zoom: number };
type MicroStep = {
  phase: number;
  title: string;
  detail: string;
  from: string;
  to: string;
  message: string;
  protocol: string;
  camera: Camera;
  conversations?: string[];
};

const PHASES = [
  { name: "Observe", color: "#f4bf58", range: [0, 3] },
  { name: "Decide", color: "#4ed9ce", range: [4, 9] },
  { name: "Match", color: "#a68af2", range: [10, 13] },
  { name: "Certify", color: "#f17687", range: [14, 17] },
  { name: "Settle", color: "#55d28e", range: [18, 19] },
] as const;

const STEPS: MicroStep[] = [
  { phase: 0, title: "Household demand is sampled", detail: "OPSD measurements enter the ingestion boundary and are checked for missing intervals.", from: "OPSD", to: "GATEWAY", message: "LOAD_PROFILE · 15 min", protocol: "CSV → validated tensor", camera: { x: 185, y: 190, zoom: 1.65 } },
  { phase: 0, title: "Solar conditions are decoded", detail: "India spectral TMY irradiance and temperature channels are aligned to the simulation clock.", from: "TMY", to: "GATEWAY", message: "GHI 684 W/m² · 31°C", protocol: "HDF5 → weather vector", camera: { x: 185, y: 290, zoom: 1.65 } },
  { phase: 0, title: "Inputs become a common state", detail: "The data gateway normalises demand, generation, tariff and weather into one timestamped snapshot.", from: "GATEWAY", to: "ORACLE", message: "STATE_VECTOR · t+15", protocol: "HTTPX · schema v3", camera: { x: 330, y: 180, zoom: 1.45 } },
  { phase: 0, title: "The oracle signs the snapshot", detail: "A signed forecast prevents agents from negotiating against inconsistent market conditions.", from: "ORACLE", to: "BUS", message: "SIGNED_SNAPSHOT · 8f2a", protocol: "Ed25519 · ZeroMQ", camera: { x: 470, y: 125, zoom: 1.45 } },
  { phase: 1, title: "State reaches every edge agent", detail: "The message bus fans the same market state out to all 72 autonomous microgrid agents.", from: "BUS", to: "ALL_AGENTS", message: "STATE v204 · seq 8,412", protocol: "PUB/SUB broadcast", camera: { x: 630, y: 320, zoom: 1.03 } },
  { phase: 1, title: "Agents evaluate local flexibility", detail: "Each policy reads only its own load, PV forecast, storage state and reserve constraints.", from: "MG-17", to: "MG-17", message: "SOC 74% · SURPLUS 3.2", protocol: "PPO policy inference", camera: { x: 515, y: 375, zoom: 2.25 }, conversations: ["MG-17 · surplus detected", "MG-18 · battery reserve held", "MG-29 · demand forecast rising"] },
  { phase: 1, title: "Sellers publish offers", detail: "Export-capable agents send quantity, limit price and delivery interval to the broker.", from: "MG-17", to: "BROKER", message: "SELL 3.2 kWh @ ₹11.6", protocol: "BID/OFFER envelope", camera: { x: 600, y: 260, zoom: 1.6 }, conversations: ["MG-17 → SELL 3.2 kWh", "MG-05 → SELL 1.8 kWh", "MG-41 → SELL 4.1 kWh"] },
  { phase: 1, title: "Buyers publish requests", detail: "Deficit agents expose the smallest information required to clear their demand.", from: "MG-39", to: "BROKER", message: "BUY 2.1 kWh ≤ ₹12.2", protocol: "BID/REQUEST envelope", camera: { x: 690, y: 350, zoom: 1.55 }, conversations: ["MG-39 → BUY 2.1 kWh", "MG-27 → BUY 1.4 kWh", "MG-62 → BUY 3.6 kWh"] },
  { phase: 1, title: "The broker opens negotiation", detail: "Compatible buyers and sellers receive a privacy-preserving counterparty proposal.", from: "BROKER", to: "MG-39", message: "PROPOSE · pair 17↔39", protocol: "Round 1 · contract-net", camera: { x: 665, y: 310, zoom: 1.45 }, conversations: ["BROKER → proposed ₹11.9", "MG-39 → counter ₹11.8", "MG-17 → accept if path valid"] },
  { phase: 1, title: "Agents converge on terms", detail: "Counteroffers continue until the utility threshold or negotiation deadline is reached.", from: "MG-39", to: "BROKER", message: "ACCEPT · ₹11.85/kWh", protocol: "Round 3 · signed ACK", camera: { x: 665, y: 310, zoom: 1.55 }, conversations: ["MG-17 ↔ MG-39 · AGREED", "MG-05 ↔ MG-27 · AGREED", "MG-41 ↔ MG-62 · REVIEW"] },
  { phase: 2, title: "The order book is ranked", detail: "The clearing engine sorts admissible trades by welfare, price spread and electrical distance.", from: "BROKER", to: "CLEARER", message: "48 BIDS · 31 CANDIDATES", protocol: "double auction", camera: { x: 755, y: 150, zoom: 1.65 } },
  { phase: 2, title: "Local coalitions are formed", detail: "The first coalition groups nearby complementary agents to reduce transport loss.", from: "CLEARER", to: "COALITION_A", message: "COALITION A · 12 PEERS", protocol: "graph matching", camera: { x: 470, y: 410, zoom: 1.75 }, conversations: ["A01 · MG-05 → MG-27", "A02 · MG-17 → MG-39", "A03 · MG-29 → MG-31"] },
  { phase: 2, title: "Parallel coalitions are composed", detail: "Independent matches are assembled concurrently while preserving local feeder capacity.", from: "CLEARER", to: "COALITION_B", message: "COALITION B · 11 PEERS", protocol: "constrained matching", camera: { x: 785, y: 505, zoom: 1.65 }, conversations: ["B01 · MG-41 → MG-62", "B02 · MG-53 → MG-66", "B03 · MG-45 → MG-58"] },
  { phase: 2, title: "A provisional dispatch is emitted", detail: "Economic clearing produces a candidate schedule; it is not executable until physically certified.", from: "CLEARER", to: "SOLVER", message: "DISPATCH_PLAN · 17.6 kWh", protocol: "candidate topology", camera: { x: 930, y: 245, zoom: 1.35 } },
  { phase: 3, title: "The solver loads network state", detail: "Current voltages, feeder ratings and the candidate injections are mapped onto the physical graph.", from: "TOPOLOGY", to: "SOLVER", message: "GRID_SNAPSHOT · 72 buses", protocol: "pandapower model", camera: { x: 1060, y: 310, zoom: 1.7 } },
  { phase: 3, title: "Power flow tests every path", detail: "The solver checks voltage bounds, thermal loading and balance for every proposed exchange.", from: "SOLVER", to: "ALL_AGENTS", message: "AC POWER FLOW · running", protocol: "Newton–Raphson", camera: { x: 790, y: 405, zoom: 1.05 } },
  { phase: 3, title: "An overloaded feeder is rerouted", detail: "Feeder F-02 exceeds the preferred margin, so the path is shifted through F-04.", from: "MG-41", to: "MG-53", message: "REROUTE F-02 → F-04", protocol: "constraint repair", camera: { x: 735, y: 500, zoom: 2.05 }, conversations: ["F-02 · loading 101.8%", "F-04 · reserve 34.2%", "SOLVER · reroute accepted"] },
  { phase: 3, title: "The dispatch receives certification", detail: "All voltage and line constraints now pass; the solver signs the topology certificate.", from: "SOLVER", to: "BROKER", message: "CERTIFIED · margin 99.2%", protocol: "grid certificate", camera: { x: 910, y: 235, zoom: 1.45 } },
  { phase: 4, title: "Certified trades are committed", detail: "The broker sends only certified quantities, price, counterparties and proof references to settlement.", from: "BROKER", to: "LEDGER", message: "SETTLE · 4 COALITIONS", protocol: "ZK proof envelope", camera: { x: 985, y: 420, zoom: 1.4 } },
  { phase: 4, title: "An immutable receipt closes the cycle", detail: "The audit ledger commits the receipt and broadcasts the final state to the command center.", from: "LEDGER", to: "UI", message: "BLOCK 08F2 · FINAL", protocol: "receipt broadcast", camera: { x: 1100, y: 585, zoom: 1.65 } },
];
const STEP_MODELS: Record<number, string[]> = {
  0: ["LSTM"],
  1: ["LSTM"],
  2: ["LSTM", "RAG"],
  3: ["RAG", "ORACLE_POLICY"],
  4: ["MAPPO", "FEDAVG"],
  5: ["MAPPO", "FEDAVG"],
  6: ["MAPPO", "DQN"],
  7: ["MAPPO", "DQN"],
  8: ["LLM", "TEMP", "DQN"],
  9: ["LLM", "DQN", "NASH"],
  10: ["GAME", "VPP"],
  11: ["GAME", "SHAPLEY"],
  12: ["GAME", "NASH"],
  13: ["VPP", "CORE_LP"],
  14: ["POWERFLOW"],
  15: ["POWERFLOW", "CORE_LP"],
  16: ["POWERFLOW", "SEPARATION"],
  17: ["CORE_LP", "VPP"],
  18: ["ZK", "POSTGRES"],
  19: ["POSTGRES", "SOCKET"],
};

function createTopology(): TopologyNode[] {
  const systems: TopologyNode[] = [
    { id: "OPSD", label: "OPSD Household", x: 70, y: 145, kind: "source" },
    { id: "TMY", label: "India Spectral TMY", x: 70, y: 285, kind: "source" },
    { id: "GATEWAY", label: "Data Gateway", x: 240, y: 215, kind: "service" },
    { id: "ORACLE", label: "Forecast Oracle", x: 385, y: 125, kind: "service" },
    { id: "BUS", label: "Message Bus", x: 540, y: 105, kind: "service" },
    { id: "BROKER", label: "Market Broker", x: 675, y: 145, kind: "service" },
    { id: "CLEARER", label: "Clearing Engine", x: 835, y: 145, kind: "service" },
    { id: "TOPOLOGY", label: "Topology State", x: 1080, y: 175, kind: "solver" },
    { id: "SOLVER", label: "Grid Solver", x: 1080, y: 325, kind: "solver" },
    { id: "LEDGER", label: "Audit Ledger", x: 1080, y: 495, kind: "ledger" },
    { id: "UI", label: "Command Center", x: 1080, y: 665, kind: "interface" },
    { id: "LSTM", label: "LSTM Forecast", x: 300, y: 90, kind: "service" },
    { id: "RAG", label: "RAG Oracle", x: 400, y: 55, kind: "service" },
    { id: "ORACLE_POLICY", label: "MAPPO Oracle", x: 475, y: 175, kind: "service" },
    { id: "MAPPO", label: "FedMAPPO Actor", x: 350, y: 210, kind: "service" },
    { id: "FEDAVG", label: "FedAvg", x: 430, y: 210, kind: "service" },
    { id: "LLM", label: "LLM Negotiator", x: 510, y: 210, kind: "service" },
    { id: "TEMP", label: "Temp Policy", x: 590, y: 210, kind: "service" },
    { id: "DQN", label: "DQN Safety Gate", x: 670, y: 210, kind: "service" },
    { id: "GAME", label: "Game Theory", x: 750, y: 210, kind: "service" },
    { id: "SHAPLEY", label: "Shapley Value", x: 830, y: 210, kind: "service" },
    { id: "NASH", label: "Nash Bargain", x: 910, y: 210, kind: "service" },
    { id: "VPP", label: "VPP Value Model", x: 990, y: 250, kind: "service" },
    { id: "SEPARATION", label: "Separation Oracle", x: 1170, y: 235, kind: "solver" },
    { id: "CORE_LP", label: "Farsighted Core LP", x: 1170, y: 325, kind: "solver" },
    { id: "POWERFLOW", label: "AC Power Flow", x: 1170, y: 415, kind: "solver" },
    { id: "REDIS", label: "Redis", x: 85, y: 410, kind: "service" },
    { id: "BULLMQ", label: "BullMQ", x: 185, y: 410, kind: "service" },
    { id: "POSTGRES", label: "PostgreSQL + Prisma", x: 85, y: 535, kind: "ledger" },
    { id: "SOCKET", label: "Socket.IO", x: 185, y: 535, kind: "interface" },
    { id: "ZK", label: "ZK Proof", x: 185, y: 625, kind: "ledger" },
    { id: "SAFETY", label: "Safety Validator", x: 1080, y: 400, kind: "solver" },
  ];
  const agents = Array.from({ length: 72 }, (_, index): TopologyNode => {
    const column = index % 12;
    const row = Math.floor(index / 12);
    return { id: `MG-${String(index + 1).padStart(2, "0")}`, label: `MG-${String(index + 1).padStart(2, "0")}`, x: 330 + column * 55 + (row % 2) * 16, y: 280 + row * 72, kind: "agent", seller: index % 4 === 0 || index % 11 === 0, group: Math.floor(column / 3) + Math.floor(row / 3) * 4 };
  });
  return [...systems, ...agents];
}

const nodeColor: Record<NodeKind, string> = { source: "#f4bf58", service: "#54d7cd", agent: "#b2c9c0", solver: "#f17687", ledger: "#55d28e", interface: "#8ebcf7" };
const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
type PublicNodeInfo = { category: string; status: string; description: string; fields: Array<[string, string]> };

function getPublicNodeInfo(node: TopologyNode): PublicNodeInfo {
  if (node.kind === "agent") {
    const number = Number(node.id.slice(3));
    const capacity = (3.8 + (number % 9) * .42).toFixed(1);
    const demand = (1.2 + (number % 7) * .31).toFixed(1);
    const battery = 42 + (number * 7) % 53;
    return {
      category: node.seller ? "Flexible exporter" : "Community consumer",
      status: "Online · telemetry current",
      description: "Residential microgrid participating through a privacy-preserving autonomous energy agent.",
      fields: [["Public node ID", node.id], ["Ward", `Energy district ${Math.floor((node.group ?? 0) / 4) + 1}`], ["Solar capacity", `${capacity} kWp`], ["Current demand", `${demand} kW`], ["Battery state", `${battery}%`], ["Market role", node.seller ? "Seller / flexible" : "Buyer / flexible"], ["Coalition", `C-${String((node.group ?? 0) + 1).padStart(2, "0")}`], ["Privacy", "Raw household data private"]],
    };
  }
  const descriptions: Record<string, [string, string, string]> = {
    OPSD: ["Public dataset", "Healthy · 15 min cadence", "Household electricity profiles used to drive demand scenarios."], TMY: ["Public weather dataset", "Healthy · hourly source", "India spectral typical-meteorological-year irradiance source."], GATEWAY: ["Data service", "Online · schema v3", "Validates, timestamps and normalises every external observation."], ORACLE: ["Trusted oracle", "Online · signature valid", "Produces the signed market-state forecast shared by all agents."], BUS: ["Message infrastructure", "Online · 72 subscribers", "Distributes state and control messages without coupling services."], BROKER: ["Market service", "Clearing round active", "Coordinates bids, counteroffers and certified settlement instructions."], CLEARER: ["Optimisation service", "Solver ready", "Builds welfare-maximising coalitions under market constraints."], TOPOLOGY: ["Grid model", "72 buses synchronised", "Public operational abstraction of feeders, limits and bus connectivity."], SOLVER: ["Safety service", "Certificate authority online", "Rejects or repairs trades that violate physical network constraints."], LEDGER: ["Audit service", "Block integrity verified", "Stores settlement receipts and proof references without raw telemetry."], UI: ["Public interface", "Live · read-only view", "Presents public system state, topology and audit events."],
    LSTM: ["Forecasting model", "PyTorch model available", "LSTM load forecaster for time-series demand prediction."],
    RAG: ["Oracle intelligence", "Context pipeline ready", "RAG-assisted weather and exogenous-stress interpretation."],
    ORACLE_POLICY: ["Oracle policy", "MAPPO actor loaded", "MAPPO-derived policy that selects the oracle broadcast action."],
    MAPPO: ["Multi-agent RL", "Actor policy active", "FedMAPPO actors choose ACCEPT, COUNTER, WALK_AWAY, JOIN or LEAVE."],
    FEDAVG: ["Federated learning", "Privacy mask enabled", "Federated averaging synchronises local actor weights without sharing private curves."],
    LLM: ["Generative negotiator", "LangChain provider guarded", "LLM proposes structured negotiation actions from sanitised public context."],
    TEMP: ["Exploration policy", "Dynamic temperature active", "Adjusts LLM exploration and exploitation during negotiation rounds."],
    DQN: ["RL safety gate", "PyTorch Q-network ready", "DQN scores and overrides unsafe or low-value LLM negotiation actions."],
    GAME: ["Game-theory engine", "Coalition round active", "Coordinates cooperative coalition formation and deviation checks."],
    SHAPLEY: ["Allocation mechanism", "Exact for small coalitions", "Distributes coalition value using marginal Shapley contributions."],
    NASH: ["Bargaining mechanism", "Optimiser available", "Approximates the Nash bargaining solution above outside options."],
    VPP: ["Coalition value model", "VPP model v1", "Non-additive VPPValueModel estimates the operational value of each coalition."],
    SEPARATION: ["Game-theory oracle", "Deviation search ready", "Searches for the most profitable deviating coalition."],
    CORE_LP: ["Stability optimiser", "Farsighted LP ready", "Computes epsilon-core stability and the minimum deviation margin."],
    POWERFLOW: ["Physical grid model", "AC solver online", "Checks voltage, loading and balance against the network model."],
    SAFETY: ["Deterministic guard", "Fail-closed validation", "Applies physical and economic hard constraints before learned decisions."],
    REDIS: ["In-memory infrastructure", "Queue backend online", "Redis transports transient queue state and coordination events."],
    BULLMQ: ["Job orchestration", "Workers healthy", "BullMQ schedules stability and oracle broadcast workloads."],
    POSTGRES: ["Audit database", "Append-only controls active", "PostgreSQL and Prisma persist negotiations, rewards, checks and receipts."],
    SOCKET: ["Real-time transport", "Clients connected", "Socket.IO streams negotiation and workflow events to the command center."],
    ZK: ["Settlement proof", "Proof envelope ready", "Zero-knowledge proof reference accompanies certified settlement metadata."],
  };
  const info = descriptions[node.id] ?? ["Infrastructure service", "Online", "GridNexus architecture component."];
  return { category: info[0], status: info[1], description: info[2], fields: [["Public node ID", node.id], ["Component type", node.kind], ["Network zone", `${Math.round(node.x)}, ${Math.round(node.y)}`], ["Visibility", "Public operational metadata"], ["Sensitive data", "Not exposed"]] };
}

export default function WorkflowPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const topology = useMemo(createTopology, []);
  const nodesById = useMemo(() => new Map(topology.map((node) => [node.id, node])), [topology]);
  const camera = useRef<Camera>({ x: WORLD.width / 2, y: WORLD.height / 2, zoom: .94 });
  const cameraTarget = useRef<Camera>({ ...STEPS[0].camera });
  const drag = useRef({ active: false, moved: false, x: 0, y: 0 });
  const [stepIndex, setStepIndex] = useState(0);
  const [running, setRunning] = useState(true);
  const [cycle, setCycle] = useState(1);
  const [recentEvents, setRecentEvents] = useState<string[]>(["Simulation clock synchronised"]);
  const step = STEPS[stepIndex];
  const activeModels = useMemo(() => STEP_MODELS[stepIndex] ?? [], [stepIndex]);
  const [selectedNode, setSelectedNode] = useState<TopologyNode | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const phase = PHASES[step.phase];

  useEffect(() => {
    cameraTarget.current = { ...step.camera };
    setRecentEvents((events) => [`${step.protocol} · ${step.message}`, ...events].slice(0, 5));
  }, [step]);

  useEffect(() => {
    const updateFullscreen = () => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setStepIndex((current) => {
        if (current === STEPS.length - 1) { setCycle((value) => value + 1); return 0; }
        return current + 1;
      });
    }, 2500);
    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let width = 0; let height = 0; let density = 1; let frame = 0;
    const resize = () => { const parent = canvas.parentElement; if (!parent) return; width = parent.clientWidth; height = parent.clientHeight; density = Math.min(window.devicePixelRatio || 1, 2); canvas.width = width * density; canvas.height = height * density; };
    const line = (from: TopologyNode, to: TopologyNode, color: string, alpha = .16, thickness = 1, dashed = false) => { context.save(); context.globalAlpha = alpha; context.strokeStyle = color; context.lineWidth = thickness; if (dashed) context.setLineDash([5, 7]); context.beginPath(); context.moveTo(from.x, from.y); context.lineTo(to.x, to.y); context.stroke(); context.restore(); };
    const packet = (from: TopologyNode, to: TopologyNode, progress: number, color: string, radius = 4) => { const x = lerp(from.x, to.x, progress); const y = lerp(from.y, to.y, progress); context.save(); context.fillStyle = color; context.shadowColor = color; context.shadowBlur = 16; context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill(); context.restore(); };
    const message = (from: TopologyNode, to: TopologyNode, text: string, progress: number, color: string) => { const x = lerp(from.x, to.x, progress); const y = lerp(from.y, to.y, progress) - 15; context.save(); context.font = "600 10px JetBrains Mono, monospace"; const measured = context.measureText(text).width; context.fillStyle = "rgba(5,20,15,.94)"; context.strokeStyle = color; context.lineWidth = 1; context.beginPath(); context.roundRect(x - measured / 2 - 8, y - 11, measured + 16, 22, 5); context.fill(); context.stroke(); context.fillStyle = "#effcf7"; context.textAlign = "center"; context.textBaseline = "middle"; context.fillText(text, x, y); context.restore(); };
    const getNode = (id: string) => nodesById.get(id);
    const draw = (timestamp: number) => {
      const time = timestamp / 1000;
      camera.current.x = lerp(camera.current.x, cameraTarget.current.x, .035);
      camera.current.y = lerp(camera.current.y, cameraTarget.current.y, .035);
      camera.current.zoom = lerp(camera.current.zoom, cameraTarget.current.zoom, .035);
      context.setTransform(density, 0, 0, density, 0, 0);
      const bg = context.createRadialGradient(width * .52, height * .45, 0, width * .52, height * .45, Math.max(width, height)); bg.addColorStop(0, "#0d2a20"); bg.addColorStop(.55, "#081c15"); bg.addColorStop(1, "#04100c"); context.fillStyle = bg; context.fillRect(0, 0, width, height);
      const scale = Math.min(width / WORLD.width, height / WORLD.height) * camera.current.zoom;
      context.save(); context.translate(width / 2, height / 2); context.scale(scale, scale); context.translate(-camera.current.x, -camera.current.y);
      context.strokeStyle = "rgba(118,190,165,.055)"; context.lineWidth = 1 / scale; for (let x = 0; x <= WORLD.width; x += 40) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, WORLD.height); context.stroke(); } for (let y = 0; y <= WORLD.height; y += 40) { context.beginPath(); context.moveTo(0, y); context.lineTo(WORLD.width, y); context.stroke(); }
      const road = (from: Point, to: Point, name: string) => { context.save(); context.lineCap = "round"; context.strokeStyle = "rgba(21,43,35,.96)"; context.lineWidth = 28; context.beginPath(); context.moveTo(from.x, from.y); context.lineTo(to.x, to.y); context.stroke(); context.strokeStyle = "rgba(183,210,199,.16)"; context.lineWidth = 1; context.setLineDash([10, 10]); context.stroke(); context.setLineDash([]); context.fillStyle = "rgba(205,229,219,.32)"; context.font = "600 8px JetBrains Mono, monospace"; context.textAlign = "center"; context.fillText(name, (from.x + to.x) / 2, (from.y + to.y) / 2 - 8); context.restore(); };
      road({ x: 285, y: 244 }, { x: 1020, y: 244 }, "ORACLE AVENUE"); road({ x: 285, y: 316 }, { x: 1018, y: 316 }, "SOLAR STREET"); road({ x: 285, y: 460 }, { x: 1018, y: 460 }, "COALITION ROAD"); road({ x: 285, y: 604 }, { x: 1018, y: 604 }, "SETTLEMENT LANE"); road({ x: 300, y: 225 }, { x: 300, y: 690 }, "DATA WAY"); road({ x: 1005, y: 225 }, { x: 1005, y: 690 }, "GRID BOULEVARD");
      context.save(); context.fillStyle = "rgba(57,108,70,.22)"; context.strokeStyle = "rgba(104,173,118,.22)"; context.lineWidth = 1; context.beginPath(); context.roundRect(520, 330, 155, 90, 18); context.fill(); context.stroke(); context.fillStyle = "rgba(153,204,159,.35)"; context.font = "600 9px JetBrains Mono, monospace"; context.fillText("COMMUNITY ENERGY PARK", 597, 380); context.restore();
      context.save(); context.strokeStyle = "rgba(74,153,176,.25)"; context.lineWidth = 24; context.beginPath(); context.moveTo(1120, 40); context.bezierCurveTo(1160, 230, 1115, 450, 1195, 745); context.stroke(); context.strokeStyle = "rgba(134,211,226,.25)"; context.lineWidth = 2; context.stroke(); context.restore();
      const agents = topology.filter((node) => node.kind === "agent");
      agents.forEach((agent, index) => { const angle = ((index % 3) - 1) * .035; context.save(); context.translate(agent.x, agent.y); context.rotate(angle); context.fillStyle = "rgba(7,18,14,.55)"; context.fillRect(-19, -11, 40, 27); context.fillStyle = agent.seller ? "rgba(94,118,105,.96)" : "rgba(72,96,85,.94)"; context.strokeStyle = "rgba(190,219,207,.2)"; context.lineWidth = 1; context.beginPath(); context.roundRect(-18, -14, 36, 25, 3); context.fill(); context.stroke(); context.fillStyle = "rgba(195,225,213,.35)"; context.fillRect(-13, -8, 7, 5); context.fillRect(6, -8, 7, 5); if (agent.seller) { context.fillStyle = "rgba(73,164,186,.75)"; context.fillRect(-12, -12, 24, 7); context.strokeStyle = "rgba(181,233,242,.42)"; context.strokeRect(-12, -12, 24, 7); } context.restore(); });
      topology.filter((node) => node.kind !== "agent").forEach((node) => { context.save(); context.fillStyle = "rgba(41,67,57,.88)"; context.strokeStyle = `${nodeColor[node.kind]}66`; context.lineWidth = 1; context.beginPath(); context.roundRect(node.x - 28, node.y - 21, 56, 38, 6); context.fill(); context.stroke(); context.fillStyle = `${nodeColor[node.kind]}55`; context.fillRect(node.x - 23, node.y - 16, 46, 5); context.restore(); });
      agents.forEach((agent, index) => { const next = agents[index + 1]; const below = agents[index + 12]; if (next && index % 12 !== 11) line(agent, next, "#79b7a3", .19, 1); if (below) line(agent, below, "#79b7a3", .19, 1); });
      [["OPSD", "GATEWAY"], ["TMY", "GATEWAY"], ["GATEWAY", "ORACLE"], ["ORACLE", "BUS"], ["BUS", "BROKER"], ["BROKER", "CLEARER"], ["CLEARER", "SOLVER"], ["TOPOLOGY", "SOLVER"], ["SOLVER", "BROKER"], ["BROKER", "LEDGER"], ["LEDGER", "UI"]].forEach(([a, b]) => { const from = getNode(a); const to = getNode(b); if (from && to) line(from, to, "#81c8b2", .3, 1.3, true); });
      [["GATEWAY", "LSTM"], ["LSTM", "RAG"], ["RAG", "ORACLE"], ["ORACLE", "ORACLE_POLICY"], ["ORACLE_POLICY", "BUS"], ["MAPPO", "FEDAVG"], ["MAPPO", "DQN"], ["LLM", "TEMP"], ["TEMP", "DQN"], ["DQN", "BROKER"], ["BROKER", "GAME"], ["GAME", "SHAPLEY"], ["GAME", "NASH"], ["GAME", "VPP"], ["VPP", "CORE_LP"], ["CORE_LP", "SEPARATION"], ["SEPARATION", "POWERFLOW"], ["TOPOLOGY", "POWERFLOW"], ["POWERFLOW", "SOLVER"], ["SOLVER", "SAFETY"], ["BUS", "REDIS"], ["REDIS", "BULLMQ"], ["BULLMQ", "BROKER"], ["LEDGER", "ZK"], ["ZK", "POSTGRES"], ["POSTGRES", "SOCKET"], ["SOCKET", "UI"]].forEach(([a, b]) => { const from = getNode(a); const to = getNode(b); if (from && to) line(from, to, "#b7d8ca", .16, 1, true); });
      const bus = getNode("BUS"); const broker = getNode("BROKER"); if (bus && broker) agents.forEach((agent, index) => { if (index % 4 === 0) line(bus, agent, "#4ed9ce", .06); if (index % 3 === 0) line(agent, broker, "#a68af2", .055); });
      if (step.phase === 2) agents.forEach((agent, index) => { const peer = agents.find((candidate) => candidate.group === agent.group && candidate.seller !== agent.seller); if (peer && index % 4 === 0) line(agent, peer, phase.color, .46, 1.8); });
      if (stepIndex === 16) { const overloaded = getNode("MG-41"); const reroute = getNode("MG-53"); if (overloaded && reroute) line(overloaded, reroute, phase.color, .95, 5); }
      const from = getNode(step.from); const to = getNode(step.to);
      const travel = (time * .27) % 1;
      const modelRoute = activeModels.map((id) => getNode(id)).filter((node): node is TopologyNode => Boolean(node));
      const routedNodes = [from, ...modelRoute, to].filter((node): node is TopologyNode => Boolean(node));
      routedNodes.slice(0, -1).forEach((routeNode, index) => { const routeTarget = routedNodes[index + 1]; line(routeNode, routeTarget, phase.color, .72, 2.1); packet(routeNode, routeTarget, (travel + index * .21) % 1, phase.color, 3.5); });
      if (step.to === "ALL_AGENTS" && from) {
        agents.forEach((agent, index) => { if (index % 3 === 0) { line(from, agent, phase.color, .21, 1.2); packet(from, agent, (travel + index * .027) % 1, phase.color, 3); } });
        const focusAgent = agents[(Math.floor(time * 2) * 3) % agents.length]; if (focusAgent) message(from, focusAgent, step.message, .52, phase.color);
      } else if (step.to.startsWith("COALITION_")) {
        const clearer = getNode("CLEARER"); const group = step.to.endsWith("A") ? 0 : 6; if (clearer) agents.filter((agent) => agent.group === group || agent.group === group + 1).forEach((agent, index) => { line(clearer, agent, phase.color, .35, 1.4); packet(clearer, agent, (travel + index * .08) % 1, phase.color, 3); });
        if (clearer) message(clearer, agents.find((agent) => agent.group === group) ?? agents[0], step.message, .46, phase.color);
      } else if (from && to) { line(from, to, phase.color, .9, 2.6); packet(from, to, travel, phase.color, 5); message(from, to, step.message, clamp(travel + .13, .18, .82), phase.color); }
      if (step.from === step.to && from) { context.save(); context.strokeStyle = phase.color; context.globalAlpha = .5 + Math.sin(time * 3) * .25; context.lineWidth = 2; context.beginPath(); context.arc(from.x, from.y, 26 + (time * 12) % 22, 0, Math.PI * 2); context.stroke(); context.restore(); }
      topology.forEach((node) => { const active = activeModels.includes(node.id) || node.id === step.from || node.id === step.to || (step.to === "ALL_AGENTS" && node.kind === "agent") || (step.to.startsWith("COALITION_") && node.kind === "agent"); const color = active ? phase.color : node.seller ? "#f4bf58" : nodeColor[node.kind]; const radius = node.kind === "agent" ? (node.seller ? 6 : 4.6) : 10; context.save(); context.fillStyle = color; context.globalAlpha = active ? 1 : .76; context.shadowColor = color; context.shadowBlur = active ? 19 : 0; context.beginPath(); if (node.kind === "agent") context.arc(node.x, node.y, radius, 0, Math.PI * 2); else context.roundRect(node.x - radius, node.y - radius, radius * 2, radius * 2, 4); context.fill(); context.shadowBlur = 0; context.textAlign = "center"; context.textBaseline = "top"; context.font = `${node.kind === "agent" ? "500 10px" : "600 11px"} JetBrains Mono, monospace`; context.fillStyle = active ? "#ffffff" : "rgba(226,244,237,.84)"; context.fillText(node.label, node.x, node.y + radius + 7); context.restore(); });
      if (selectedNode) { context.save(); context.strokeStyle = "#ffffff"; context.lineWidth = 2; context.setLineDash([4, 4]); context.beginPath(); context.arc(selectedNode.x, selectedNode.y, selectedNode.kind === "agent" ? 24 : 34, 0, Math.PI * 2); context.stroke(); context.setLineDash([]); context.fillStyle = "#ffffff"; context.font = "600 9px JetBrains Mono, monospace"; context.textAlign = "center"; context.fillText("SELECTED", selectedNode.x, selectedNode.y - (selectedNode.kind === "agent" ? 31 : 42)); context.restore(); }
      if (step.conversations) step.conversations.forEach((text, index) => { const agent = agents[(stepIndex * 7 + index * 13) % agents.length]; context.save(); context.font = "500 9px JetBrains Mono, monospace"; const measured = context.measureText(text).width; const x = agent.x + (index % 2 ? 14 : -14); const y = agent.y - 26 - index * 2; context.fillStyle = "rgba(7,25,18,.93)"; context.strokeStyle = phase.color; context.globalAlpha = .96; context.beginPath(); context.roundRect(x - measured / 2 - 6, y - 9, measured + 12, 18, 4); context.fill(); context.stroke(); context.fillStyle = "#effcf7"; context.textAlign = "center"; context.textBaseline = "middle"; context.fillText(text, x, y); context.restore(); });
      context.restore();
      frame = requestAnimationFrame(draw);
    };
    window.addEventListener("resize", resize); resize(); frame = requestAnimationFrame(draw);
    return () => { window.removeEventListener("resize", resize); cancelAnimationFrame(frame); };
  }, [activeModels, nodesById, phase.color, selectedNode, step, stepIndex, topology]);

  const selectStep = (index: number) => { setStepIndex(index); setRunning(false); };
  const previous = () => selectStep((stepIndex - 1 + STEPS.length) % STEPS.length);
  const next = () => selectStep((stepIndex + 1) % STEPS.length);
  const resetCamera = () => { cameraTarget.current = { ...step.camera }; };
  const inspectAt = (event: PointerEvent<HTMLCanvasElement>) => { if (drag.current.moved) return; const canvas = canvasRef.current; if (!canvas) return; const bounds = canvas.getBoundingClientRect(); const scale = Math.min(canvas.clientWidth / WORLD.width, canvas.clientHeight / WORLD.height) * camera.current.zoom; const worldX = (event.clientX - bounds.left - canvas.clientWidth / 2) / scale + camera.current.x; const worldY = (event.clientY - bounds.top - canvas.clientHeight / 2) / scale + camera.current.y; const nearest = topology.map((node) => ({ node, distance: Math.hypot(node.x - worldX, node.y - worldY) })).filter(({ node, distance }) => distance <= (node.kind === "agent" ? 24 : 38)).sort((a, b) => a.distance - b.distance)[0]?.node ?? null; setSelectedNode(nearest); if (nearest) { setRunning(false); cameraTarget.current = { x: nearest.x, y: nearest.y, zoom: Math.max(cameraTarget.current.zoom, 1.75) }; } };
  const pointerDown = (event: PointerEvent<HTMLCanvasElement>) => { event.currentTarget.setPointerCapture(event.pointerId); drag.current = { active: true, moved: false, x: event.clientX, y: event.clientY }; };
  const pointerMove = (event: PointerEvent<HTMLCanvasElement>) => { if (!drag.current.active) return; const canvas = canvasRef.current; if (!canvas) return; const scale = Math.min(canvas.clientWidth / WORLD.width, canvas.clientHeight / WORLD.height) * cameraTarget.current.zoom; const dx = event.clientX - drag.current.x; const dy = event.clientY - drag.current.y; drag.current = { active: true, moved: drag.current.moved || Math.abs(dx) + Math.abs(dy) > 2, x: event.clientX, y: event.clientY }; cameraTarget.current = { ...cameraTarget.current, x: cameraTarget.current.x - dx / scale, y: cameraTarget.current.y - dy / scale }; };
  const pointerEnd = (event: PointerEvent<HTMLCanvasElement>) => { inspectAt(event); drag.current.active = false; };
  const pointerCancel = () => { drag.current.active = false; };
  const wheel = (event: WheelEvent<HTMLCanvasElement>) => { event.preventDefault(); cameraTarget.current = { ...cameraTarget.current, zoom: clamp(cameraTarget.current.zoom * (event.deltaY < 0 ? 1.14 : .88), .72, 3.2) }; };
  const toggleFullscreen = async () => { try { if (document.fullscreenElement === rootRef.current) await document.exitFullscreen(); else await rootRef.current?.requestFullscreen(); } catch { setFullscreen(false); } };
  const selectedInfo = selectedNode ? getPublicNodeInfo(selectedNode) : null;

  return <div ref={rootRef} className="network-workflow" style={{ "--phase": phase.color } as CSSProperties}>
    <canvas ref={canvasRef} className="network-canvas" aria-label="Interactive city map of the GridNexus architecture. Click any named node or building for public information." role="application" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerCancel} onWheel={wheel} />
    <header className="network-title"><div className="network-live"><span /> LIVE ARCHITECTURE · CYCLE {String(cycle).padStart(2, "0")}</div><h1>GridNexus system trace</h1><p>Follow every message from raw energy data to certified settlement.</p></header>
    <div className="network-controls"><button type="button" onClick={previous} aria-label="Previous micro-step">←</button><button className="network-play" type="button" onClick={() => setRunning((value) => !value)}>{running ? "Pause" : "Resume"}</button><button type="button" onClick={next} aria-label="Next micro-step">→</button><button type="button" onClick={resetCamera}>Reset view</button><button className="network-fullscreen" type="button" onClick={toggleFullscreen} aria-pressed={fullscreen}>{fullscreen ? "Exit full screen" : "Full screen"}</button></div>
    <section className="network-current" aria-live="polite"><div><span>{phase.name} · micro-step {stepIndex + 1}/{STEPS.length}</span><h2>{step.title}</h2><p>{step.detail}</p></div><div className="network-payload"><span>MESSAGE IN FLIGHT</span><strong>{step.message}</strong><small>{step.protocol}</small></div></section>
    {selectedNode && selectedInfo && <aside className="node-inspector" aria-label={`Public information for ${selectedNode.label}`}><button className="node-inspector-close" type="button" onClick={() => setSelectedNode(null)} aria-label="Close node information">×</button><div className="node-inspector-kicker">PUBLIC NODE INFORMATION</div><h2>{selectedNode.label}</h2><div className="node-inspector-status"><i />{selectedInfo.status}</div><p>{selectedInfo.description}</p><dl>{selectedInfo.fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><small>Only non-sensitive operational metadata is displayed.</small></aside>}
    <div className="network-model-strip"><span>ACTIVE MODELS & SYSTEMS</span>{activeModels.map((id) => <button type="button" key={id} onClick={() => { const node = nodesById.get(id); if (node) { setSelectedNode(node); setRunning(false); cameraTarget.current = { x: node.x, y: node.y, zoom: 1.9 }; } }}>{nodesById.get(id)?.label ?? id}</button>)}</div>
    <section className="network-events" aria-label="Recent network events"><span>EVENT STREAM</span>{recentEvents.map((event, index) => <p key={`${event}-${index}`} className={index === 0 ? "is-current" : ""}><i>{String(stepIndex - index + 1).padStart(2, "0")}</i>{event}</p>)}</section>
    <div className="network-legend"><span><i className="legend-source" />Data source</span><span><i className="legend-service" />Service</span><span><i className="legend-agent" />Microgrid</span><span><i className="legend-seller" />Exporter</span><span><i className="legend-solver" />Safety boundary</span></div>
    <nav className="network-timeline" aria-label="Detailed workflow timeline">
      <div className="network-timeline-track">{STEPS.map((item, index) => <button type="button" key={`${item.title}-${index}`} onClick={() => selectStep(index)} className={index === stepIndex ? "is-active" : index < stepIndex ? "is-complete" : ""} aria-label={`Step ${index + 1}: ${item.title}`} aria-current={index === stepIndex ? "step" : undefined}><i style={{ "--dot": PHASES[item.phase].color } as CSSProperties} /><span>{index + 1}</span></button>)}</div>
      <div className="network-phase-labels">{PHASES.map((item) => <button type="button" key={item.name} onClick={() => selectStep(item.range[0])} className={item.name === phase.name ? "is-active" : ""} style={{ "--phase-label": item.color } as CSSProperties}><span>{item.name}</span><small>steps {item.range[0] + 1}–{item.range[1] + 1}</small></button>)}</div>
    </nav>
    <div className="network-help">Click any building for public info · drag to pan · scroll to zoom · camera follows messages automatically</div>
  </div>;
}
