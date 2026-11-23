// Two-level CVE vulnerability classification ("group of groups") that
// normalizes the 200+ raw NVD/Chromium `problem` strings (casing variants,
// CWE-prefixed duplicates, synonyms) into canonical sub-groups organized under
// high-level security categories.

export interface CveCategoryDef {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  color: string;
}

export interface CveClassification {
  categoryId: string;
  categoryLabel: string;
  subgroup: string;
  rawProblem: string;
}

export const CVE_CATEGORIES: readonly CveCategoryDef[] = [
  {
    id: "memory",
    label: "Memory Safety",
    shortLabel: "Memory",
    description: "Use-after-free, buffer overflows, out-of-bounds access, type confusion, uninitialized memory, integer arithmetic.",
    color: "var(--series-8)",
  },
  {
    id: "access",
    label: "Access Control & Isolation",
    shortLabel: "Access",
    description: "Authorization flaws, policy/sandbox bypasses, origin validation errors, privilege escalation, auth & crypto.",
    color: "var(--series-2)",
  },
  {
    id: "input",
    label: "Input Validation & Injection",
    shortLabel: "Input",
    description: "Insufficient input/state validation, XSS, code/script injection, CSRF, SSRF, open redirects.",
    color: "var(--series-4)",
  },
  {
    id: "ui",
    label: "UI & Spoofing",
    shortLabel: "UI",
    description: "UI misrepresentation, address bar / security UI spoofing, clickjacking and framing issues.",
    color: "var(--series-7)",
  },
  {
    id: "disclosure",
    label: "Information Disclosure",
    shortLabel: "Disclosure",
    description: "Sensitive data leaks, observable discrepancies, and side-channel information leakage.",
    color: "var(--series-1)",
  },
  {
    id: "logic",
    label: "Concurrency & Logic",
    shortLabel: "Logic",
    description: "Race conditions, inappropriate implementations, reference resolution, and control-flow flaws.",
    color: "var(--series-3)",
  },
  {
    id: "other",
    label: "Other / Unclassified",
    shortLabel: "Other",
    description: "CVEs without enough public classification details (e.g. CWE-noinfo or generic security issues).",
    color: "var(--muted)",
  },
] as const;

export const CVE_CATEGORY_MAP: Record<string, CveCategoryDef> = Object.fromEntries(
  CVE_CATEGORIES.map((c) => [c.id, c]),
);

interface Rule {
  categoryId: string;
  subgroup: string;
  cweIds?: number[];
  patterns?: RegExp[];
}

// Rules are evaluated in order; more specific rules come before broader ones.
const RULES: Rule[] = [
  // ── Memory Safety ──────────────────────────────────────────────────────────
  {
    categoryId: "memory",
    subgroup: "Use-After-Free & Lifecycle",
    cweIds: [416, 415, 664, 672, 1091],
    patterns: [
      /use[\s-]*after[\s-]*free/,
      /user after free/,
      /write[\s-]*after[\s-]*free/,
      /double[\s-]*free/,
      /free of non-heap/,
      /use of released resource/,
      /after expiration or release/,
      /object lifecycle/,
      /object corruption/,
      /incomplete cleanup/,
      /resource through its lifetime/,
      /improper resource control/,
      /use of stale data/,
      /without invoking destructor/,
    ],
  },
  {
    categoryId: "memory",
    subgroup: "Heap & Buffer Overflow",
    cweIds: [119, 120, 121, 122],
    patterns: [
      /heap[\s-]*(based[\s-]*)?buffer overflow/,
      /stack[\s-]*(based[\s-]*)?buffer overflow/,
      /buffer overflow/,
      /buffer copy without checking size/,
      /bounds of a memory buffer/,
      /^stack overflow$/,
    ],
  },
  {
    categoryId: "memory",
    subgroup: "Out-of-Bounds Read",
    cweIds: [125],
    patterns: [
      /out[\s-]*of[\s-]*bounds[\s-]*(memory[\s-]*)?read(?!.*write)/,
    ],
  },
  {
    categoryId: "memory",
    subgroup: "Out-of-Bounds Write",
    cweIds: [787],
    patterns: [
      /out[\s-]*of[\s-]*bounds[\s-]*(memory[\s-]*)?write/,
    ],
  },
  {
    categoryId: "memory",
    subgroup: "Out-of-Bounds Access",
    cweIds: [129, 193],
    patterns: [
      /out[\s-]*of[\s-]*bounds/,
      /off[\s-]*by[\s-]*one/,
      /validation of array index/,
    ],
  },
  {
    categoryId: "memory",
    subgroup: "Type Confusion",
    cweIds: [843, 704],
    patterns: [
      /type confusion/,
      /incompatible type/,
      /bad cast/,
      /incorrect type conversion/,
    ],
  },
  {
    categoryId: "memory",
    subgroup: "Uninitialized Memory",
    cweIds: [457, 908, 665],
    patterns: [
      /uninitialized/,
      /improper initialization/,
    ],
  },
  {
    categoryId: "memory",
    subgroup: "Integer & Arithmetic",
    cweIds: [190, 191, 194, 197, 682],
    patterns: [
      /integer overflow/,
      /integer underflow/,
      /sign extension/,
      /numeric truncation/,
      /incorrect calculation/,
    ],
  },
  {
    categoryId: "memory",
    subgroup: "Memory Corruption",
    cweIds: [674],
    patterns: [
      /memory corruption/,
      /uncontrolled recursion/,
    ],
  },

  // ── UI & Spoofing ──────────────────────────────────────────────────────────
  {
    categoryId: "ui",
    subgroup: "UI Misrepresentation & Spoofing",
    cweIds: [451, 449],
    patterns: [
      /ui misrepresentation/,
      /misrepresentation of critical information/,
      /incorrect security ui/,
      /spoof.*(omnibox|url bar|browser ui)/,
      /ui performs the wrong action/,
    ],
  },
  {
    categoryId: "ui",
    subgroup: "Clickjacking & UI Layering",
    cweIds: [1021],
    patterns: [
      /clickjacking/,
      /rendered ui layers or frames/,
    ],
  },

  // ── Access Control & Isolation ─────────────────────────────────────────────
  {
    categoryId: "access",
    subgroup: "Authorization & Access Control",
    cweIds: [284, 285, 639, 732, 862, 863],
    patterns: [
      /authorization/,
      /access control/,
      /permission assignment/,
    ],
  },
  {
    categoryId: "access",
    subgroup: "Policy & Protection Bypass",
    cweIds: [358, 602, 693, 1268],
    patterns: [
      /policy enforcement/,
      /policy bypass/,
      /protection mechanism failure/,
      /client-side enforcement/,
      /security check for standard/,
      /policy privileges/,
      /bypass restrictions on navigation/,
    ],
  },
  {
    categoryId: "access",
    subgroup: "Origin & Cross-Domain",
    cweIds: [346, 942],
    patterns: [
      /origin validation/,
      /cross-domain policy/,
      /cross-origin restrictions/,
    ],
  },
  {
    categoryId: "access",
    subgroup: "Privilege & Confused Deputy",
    cweIds: [250, 269, 441],
    patterns: [
      /confused deputy/,
      /privilege management/,
      /privilege elevation/,
      /unnecessary privileges/,
    ],
  },
  {
    categoryId: "access",
    subgroup: "Authentication & Cryptography",
    cweIds: [287, 288, 290, 295, 303, 306, 325, 326, 327, 330, 345, 347],
    patterns: [
      /authentication/,
      /certificate validation/,
      /encryption strength/,
      /cryptographic/,
      /signature verification/,
      /nonce reuse/,
      /insufficiently random/,
      /data authenticity/,
    ],
  },

  // ── Input Validation & Injection ───────────────────────────────────────────
  {
    categoryId: "input",
    subgroup: "XSS & Code Injection",
    cweIds: [79, 91, 94, 829, 838],
    patterns: [
      /cross-site scripting/,
      /\buxss\b/,
      /code injection/,
      /script injection/,
      /xml injection/,
      /\binjection\b/,
      /output encoding/,
      /encoding or escaping of output/,
      /encoding for output context/,
      /untrusted control sphere/,
    ],
  },
  {
    categoryId: "input",
    subgroup: "CSRF, SSRF & Redirects",
    cweIds: [352, 601, 918],
    patterns: [
      /cross-site request forgery/,
      /\bcsrf\b/,
      /server-side request forgery/,
      /\bssrf\b/,
      /open redirect/,
      /redirection to untrusted site/,
      /unsafe navigation/,
    ],
  },
  {
    categoryId: "input",
    subgroup: "Input & State Validation",
    cweIds: [20, 22, 59, 427, 472, 807, 1284, 1287],
    patterns: [
      /validation of untrusted input/,
      /input validation/,
      /data validation/,
      /state validation/,
      /quantity validation/,
      /specified (type|quantity) of input/,
      /untrusted inputs in a security decision/,
      /assumed-immutable web parameter/,
      /pathname to a restricted directory/,
      /link following/,
      /uncontrolled search path/,
      /case sensitivity/,
      /parameter passing/,
    ],
  },

  // ── Information Disclosure ─────────────────────────────────────────────────
  {
    categoryId: "disclosure",
    subgroup: "Side-Channel & Timing",
    cweIds: [203, 1300],
    patterns: [
      /side[\s-]*channel/,
      /observable discrepancy/,
    ],
  },
  {
    categoryId: "disclosure",
    subgroup: "Information Leak",
    cweIds: [200, 319, 522, 1295],
    patterns: [
      /information leak/,
      /information disclosure/,
      /information loss/,
      /sensitive information/,
      /data leak/,
      /leak of object/,
      /resource exposure/,
      /debug messages revealing/,
      /cleartext transmission/,
      /unprotected credentials/,
      /protected credentials/,
    ],
  },

  // ── Concurrency & Logic ────────────────────────────────────────────────────
  {
    categoryId: "logic",
    subgroup: "Race Condition",
    cweIds: [362, 366],
    patterns: [
      /race condition/,
      /^race$/,
      /data race/,
      /concurrent execution/,
      /improper synchronization/,
    ],
  },
  {
    categoryId: "logic",
    subgroup: "Implementation & Logic Flaw",
    cweIds: [252, 374, 436, 474, 610, 691, 697, 710, 840],
    patterns: [
      /inappropriate implementation/,
      /reference resolution/,
      /externally controlled reference/,
      /inconsistent implementations/,
      /specified functionality/,
      /mutable objects to an untrusted method/,
      /control flow management/,
      /behavioral workflow/,
      /interpretation conflict/,
      /unchecked return value/,
      /incorrect comparison/,
      /coding standards/,
      /compiler optimisations/,
      /transition mishandling/,
    ],
  },
];

const parseCweNumber = (raw?: string | null): number | null => {
  if (!raw) return null;
  const m = String(raw).match(/(\d+)/);
  return m ? Number(m[1]) : null;
};

const GENERIC_PROBLEMS = new Set([
  "",
  "n/a",
  "cwe-noinfo not enough information",
  "security issue",
  "mixed",
  "various fixes from internal audits",
]);

export function classifyCve(cve: { problem?: string; cweId?: string }): CveClassification {
  const rawProblem = (cve.problem || "").trim();
  const normalized = rawProblem.toLowerCase();

  // 1. Match by problem text first (more specific than broad parent CWEs).
  if (normalized) {
    for (const rule of RULES) {
      if (rule.patterns?.some((re) => re.test(normalized))) {
        return {
          categoryId: rule.categoryId,
          categoryLabel: CVE_CATEGORY_MAP[rule.categoryId].label,
          subgroup: rule.subgroup,
          rawProblem: rawProblem || "Unspecified",
        };
      }
    }
  }

  // 2. Fallback to numeric CWE ID (from either `cweId` field or `CWE-NNN` prefix in `problem`).
  const cweNum = parseCweNumber(cve.cweId) ?? parseCweNumber(rawProblem);
  if (cweNum !== null) {
    for (const rule of RULES) {
      if (rule.cweIds?.includes(cweNum)) {
        return {
          categoryId: rule.categoryId,
          categoryLabel: CVE_CATEGORY_MAP[rule.categoryId].label,
          subgroup: rule.subgroup,
          rawProblem: rawProblem || `CWE-${cweNum}`,
        };
      }
    }
  }

  // 3. Generic / unknown fallback.
  const isGeneric = GENERIC_PROBLEMS.has(normalized) || normalized.startsWith("cwe-noinfo");
  return {
    categoryId: "other",
    categoryLabel: CVE_CATEGORY_MAP.other.label,
    subgroup: isGeneric ? "Unspecified / Other" : rawProblem,
    rawProblem: rawProblem || "Unspecified",
  };
}
