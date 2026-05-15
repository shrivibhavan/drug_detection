// Drug trafficking detection keywords and patterns
const TRAFFICKING_PATTERNS = [
  // Supply/dealing intent
  /\b(sell|selling|supply|supplies|supplier|dealer|dealing|distribute|distribution|wholesale|bulk|kilo|kg|gram|g)\b.*\b(drug|meth|heroin|cocaine|mdma|lsd|fentanyl|smack|charas|ganja|afeem|brown sugar|ice|crystal)\b/i,
  /\b(drug|meth|heroin|cocaine|mdma|lsd|fentanyl|smack|charas|ganja|afeem|brown sugar|ice|crystal)\b.*\b(sell|selling|supply|dealer|dealing|distribute|wholesale|bulk|kilo|kg)\b/i,
  // Price negotiation for large quantities
  /\b(price|rate|cost)\b.*\b(per kg|per kilo|per pound|bulk|wholesale)\b/i,
  // Trafficking routes/smuggling
  /\b(smuggl|traffic|import|export|cross.*border|border.*cross|shipment|consignment)\b.*\b(drug|narcotic|substance|contraband)\b/i,
  /\b(drug|narcotic)\b.*\b(smuggl|traffic|route|network|cartel|gang)\b/i,
  // Manufacturing
  /\b(cook|cooking|manufacture|lab|laboratory|synthesis|synthesize)\b.*\b(meth|heroin|mdma|drug|crystal)\b/i,
  // Money laundering related
  /\b(launder|hawala|clean money)\b.*\b(drug|narco)\b/i,
  // Direct trafficking intent
  /\bhow (to|do i|can i).*(sell|deal|supply|traffic|smuggle).*(drug|meth|heroin|cocaine|ganja|charas)\b/i,
  /\b(looking for|need|want).*(supplier|dealer|source).*(bulk|kilo|wholesale)\b/i,
];

// Simple drug keyword detection (broader — catches casual drug mentions too)
const DRUG_KEYWORDS = [
  "cocaine", "heroin", "meth", "methamphetamine", "mdma", "ecstasy",
  "lsd", "fentanyl", "smack", "charas", "ganja", "afeem", "opium",
  "brown sugar", "ice", "crystal meth", "weed", "marijuana", "hash",
  "hashish", "crack", "amphetamine", "ketamine", "xanax", "codeine",
  "morphine", "oxycontin", "tramadol", "psychedelics", "shrooms",
  "mushrooms", "dmt", "pcp", "ghb", "rohypnol", "molly",
  // Hindi/slang terms
  "nasha", "nashe", "gard", "chitta", "sulfa", "bhang",
  "charsi", "junkie", "maal", "stuff", "score", "stash",
];

export function detectDrugContent(message: string): {
  detected: boolean;
  confidence: "high" | "medium" | "low";
  matchedPattern?: string;
} {
  const lowerMsg = message.toLowerCase();

  // Check trafficking patterns first (high confidence)
  for (const pattern of TRAFFICKING_PATTERNS) {
    if (pattern.test(lowerMsg)) {
      return {
        detected: true,
        confidence: "high",
        matchedPattern: pattern.toString(),
      };
    }
  }

  // Secondary check: multiple suspicious keywords together
  const suspiciousKeywords = [
    "sell", "dealer", "supply", "bulk", "wholesale", "kilo", "shipment",
    "smuggle", "traffic", "distribute", "network", "cartel",
  ];

  const drugKeywords = [
    "drug", "meth", "heroin", "cocaine", "mdma", "lsd", "fentanyl",
    "smack", "charas", "ganja", "afeem", "brown sugar", "ice", "crystal", "narcotic",
  ];

  const hasSuspicious = suspiciousKeywords.some(k => lowerMsg.includes(k));
  const hasDrug = drugKeywords.some(k => lowerMsg.includes(k));

  if (hasSuspicious && hasDrug) {
    return { detected: true, confidence: "medium" };
  }

  // Simple drug keyword mention (low confidence — still flag it)
  const hasDrugKeyword = DRUG_KEYWORDS.some(k => lowerMsg.includes(k));
  if (hasDrugKeyword) {
    return { detected: true, confidence: "low" };
  }

  return { detected: false, confidence: "low" };
}
