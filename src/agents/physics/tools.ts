import { tool } from "ai";
import { z } from "zod";
import { evaluate } from "mathjs";

const FORMULAS: Array<{ id: string; name: string; expression: string; notes: string; aliases?: string[] }> = [
  { id: "f-ma", name: "Newton's second law", expression: "F = ma", notes: "F in N, m in kg, a in m/s^2", aliases: ["force", "resultant force"] },
  { id: "suvat-v", name: "SUVAT velocity", expression: "v = u + at", notes: "constant acceleration", aliases: ["final speed", "final velocity"] },
  { id: "suvat-s", name: "SUVAT displacement", expression: "s = ut + 1/2 at^2", notes: "constant acceleration", aliases: ["displacement"] },
  { id: "ke", name: "Kinetic energy", expression: "E_k = 1/2 mv^2", notes: "joules" },
  { id: "gpe", name: "Gravitational potential energy", expression: "E_p = mgh", notes: "near Earth, g ≈ 9.81 m/s^2" },
  { id: "ohm", name: "Ohm's law", expression: "V = IR", notes: "V in V, I in A, R in Ω" },
  { id: "power-elec", name: "Electrical power", expression: "P = IV = I^2 R = V^2 / R", notes: "watts" },
  { id: "wave", name: "Wave equation", expression: "v = f λ", notes: "f in Hz, λ in m", aliases: ["waves", "wave speed", "frequency and wavelength"] },
  { id: "density", name: "Density", expression: "ρ = m / V", notes: "kg/m^3" },
  { id: "pressure", name: "Pressure", expression: "p = F / A", notes: "pascals" },
  { id: "capacitance", name: "Capacitance", expression: "C = Q / V", notes: "C in F, Q in C, V in V; check the student's course using documentSearch for coverage" },
  { id: "ideal-gas", name: "Ideal-gas equation of state", expression: "pV = nRT", notes: "p in Pa, V in m^3, n in mol, T in K; R = 8.31 J/(mol K) when supplied; p = nRT/V", aliases: ["ideal gas", "gas law"] },
  { id: "lens", name: "Thin lens", expression: "1/f = 1/u + 1/v", notes: "real-is-positive convention when specified; this equation/sign convention is extension beyond the listed 6091 lens outcomes, not syllabus evidence" },
];

const TO_SI: Record<string, { si: string; factor: number }> = {
  mm: { si: "m", factor: 0.001 },
  cm: { si: "m", factor: 0.01 },
  m: { si: "m", factor: 1 },
  km: { si: "m", factor: 1000 },
  "m/s": { si: "m/s", factor: 1 },
  "km/h": { si: "m/s", factor: 1000 / 3600 },
  g: { si: "kg", factor: 0.001 },
  kg: { si: "kg", factor: 1 },
  N: { si: "N", factor: 1 },
  kN: { si: "N", factor: 1000 },
  J: { si: "J", factor: 1 },
  kJ: { si: "J", factor: 1000 },
  W: { si: "W", factor: 1 },
  kW: { si: "W", factor: 1000 },
  C: { si: "K", factor: 1 },
  K: { si: "K", factor: 1 },
  min: { si: "s", factor: 60 },
  h: { si: "s", factor: 3600 },
  s: { si: "s", factor: 1 },
};

function toSi(value: number, unit: string) {
  if (unit === "C") return { value: value + 273.15, unit: "K" };
  const mapped = TO_SI[unit];
  if (!mapped) return null;
  return { value: value * mapped.factor, unit: mapped.si };
}

function fromSi(value: number, siUnit: string, target: string) {
  if (target === "C" && siUnit === "K") return value - 273.15;
  const mapped = TO_SI[target];
  if (!mapped || mapped.si !== siUnit) return null;
  return value / mapped.factor;
}

const diagramText = z.string().trim().min(1).max(160);
const finiteDiagramNumber = z.number().finite().min(-1_000_000).max(1_000_000);

const freeBodyDiagramSchema = z.object({
  kind: z.literal("free-body"),
  title: diagramText,
  description: diagramText,
  objectLabel: diagramText.max(40),
  showSurface: z.boolean().default(true),
  forces: z
    .array(
      z.object({
        direction: z.enum(["up", "down", "left", "right"]),
        label: diagramText.max(60),
        magnitude: z.number().finite().positive().max(1_000_000).optional(),
      }),
    )
    .min(1)
    .max(4)
    .refine(
      (forces) => new Set(forces.map((force) => force.direction)).size === forces.length,
      "Combine forces that act in the same direction before drawing the diagram.",
    ),
});

const motionGraphDiagramSchema = z.object({
  kind: z.literal("motion-graph"),
  title: diagramText,
  description: diagramText,
  xLabel: diagramText.max(30),
  yLabel: diagramText.max(30),
  seriesLabel: diagramText.max(60).optional(),
  points: z
    .array(z.object({ x: finiteDiagramNumber, y: finiteDiagramNumber }))
    .min(2)
    .max(20),
});

const convergingLensDiagramSchema = z
  .object({
    kind: z.literal("converging-lens"),
    title: diagramText,
    description: diagramText,
    focalLength: z.number().finite().positive().max(1_000_000),
    objectDistance: z.number().finite().positive().max(1_000_000),
    objectHeight: z.number().finite().positive().max(1_000_000),
  })
  .refine(
    ({ focalLength, objectDistance }) => objectDistance > focalLength * 1.05,
    {
      message: "This first version draws real images only, so object distance must exceed focal length.",
      path: ["objectDistance"],
    },
  );

const physicsDiagramSchema = z.discriminatedUnion("kind", [
  freeBodyDiagramSchema,
  motionGraphDiagramSchema,
  convergingLensDiagramSchema,
]);

// OpenAI function tools require a top-level JSON Schema object. A discriminated
// union serialises as `anyOf`, so expose one object to the model and perform the
// stricter per-kind validation again inside execute.
const physicsDiagramInputSchema = z.object({
  kind: z.enum(["free-body", "motion-graph", "converging-lens"]),
  title: diagramText,
  description: diagramText,
  objectLabel: diagramText.max(40).optional(),
  showSurface: z.boolean().optional(),
  forces: z
    .array(
      z.object({
        direction: z.enum(["up", "down", "left", "right"]),
        label: diagramText.max(60),
        magnitude: z.number().finite().positive().max(1_000_000).optional(),
      }),
    )
    .min(1)
    .max(4)
    .optional(),
  xLabel: diagramText.max(30).optional(),
  yLabel: diagramText.max(30).optional(),
  seriesLabel: diagramText.max(60).optional(),
  points: z
    .array(z.object({ x: finiteDiagramNumber, y: finiteDiagramNumber }))
    .min(2)
    .max(20)
    .optional(),
  focalLength: z.number().finite().positive().max(1_000_000).optional(),
  objectDistance: z.number().finite().positive().max(1_000_000).optional(),
  objectHeight: z.number().finite().positive().max(1_000_000).optional(),
});

export const formulaLookupTool = tool({
  description: "Look up a standard physics formula used in Singapore syllabuses.",
  inputSchema: z.object({
    topic: z.string().describe("Keyword such as 'kinetic energy' or 'ohm'"),
  }),
  execute: async ({ topic }: { topic: string }) => {
    const needle = topic.trim().toLowerCase();
    const hits = FORMULAS.filter(
      (row) =>
        row.id.includes(needle) ||
        row.name.toLowerCase().includes(needle) ||
        row.expression.toLowerCase().includes(needle) ||
        (row.aliases ?? []).some((alias) => alias.includes(needle)),
    );
    // 3. Consistency & Reliability: an unknown topic must not return unrelated formulas.
    return needle && hits.length
      ? { hits }
      : { hits: [], error: "No matching formula found. Try a specific formula name." };
  },
});

export const unitConverterTool = tool({
  description: "Convert a physical quantity between common school units via SI.",
  inputSchema: z.object({
    value: z.number(),
    from: z.string().describe("Unit such as km/h, cm, C, kJ"),
    to: z.string(),
  }),
  execute: async ({ value, from, to }: { value: number; from: string; to: string }) => {
    const si = toSi(value, from);
    if (!si) {
      return { ok: false, error: `Unsupported source unit ${from}` };
    }
    const converted = fromSi(si.value, si.unit, to);
    if (converted === null) {
      return { ok: false, error: `Cannot convert ${from} to ${to}` };
    }
    return {
      ok: true,
      input: { value, from },
      si,
      output: { value: Number(converted.toPrecision(8)), to },
    };
  },
});

const arithmeticInputSchema = z.object({
  expression: z.string().trim().min(1).max(200)
    .regex(/^[0-9.eE+\-*/^()\s]+$/, "Use numbers and arithmetic operators only."),
});

export const calculatePhysicsTool = tool({
  description: "Verify a Physics numerical substitution after formula lookup. Supply numbers with +, -, *, /, ^ and parentheses; use e notation for powers of ten. No variables, units, functions or executable code. Convert quantities to compatible units first; round only the final answer.",
  inputSchema: arithmeticInputSchema,
  execute: async (input) => {
    try {
      const { expression } = arithmeticInputSchema.parse(input);
      // The character whitelist excludes assignments, functions and access to
      // objects. Standalone symbols (including Euler's e) are not substitutions.
      if (/(^|[^0-9.])[eE]/.test(expression)) return { ok: false, error: "Use e only inside a numeric exponent such as 1e-3." };
      const value: unknown = evaluate(expression);
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return { ok: false, error: "The substitution must produce a finite real number." };
      }
      return { ok: true, expression, value };
    } catch {
      return { ok: false, error: "Invalid numerical substitution. Use numbers and arithmetic operators only." };
    }
  },
});

export const drawPhysicsDiagramTool = tool({
  description:
    "Draw a precise Physics visual when it materially helps: a free-body diagram, a piecewise-linear motion graph, or a converging-lens ray diagram for a real image. Use only values and labels supported by the question; never invent missing measurements.",
  inputSchema: physicsDiagramInputSchema,
  execute: async (input) => {
    const spec = physicsDiagramSchema.parse(input);
    if (spec.kind !== "converging-lens") {
      return { renderer: "jsxgraph" as const, spec };
    }

    const imageDistance = 1 / (1 / spec.focalLength - 1 / spec.objectDistance);
    const magnification = -imageDistance / spec.objectDistance;
    return {
      renderer: "jsxgraph" as const,
      spec,
      derived: {
        imageDistance: Number(imageDistance.toPrecision(8)),
        imageHeight: Number((magnification * spec.objectHeight).toPrecision(8)),
        magnification: Number(magnification.toPrecision(8)),
      },
    };
  },
});
