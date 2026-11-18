const NEGATE =
  String.raw`\b(?:without|no|not\s+using|not\s+use|don'?t\s+use|do\s+not\s+use|avoid(?:ing)?|instead\s+of|never\s+use|except)\s+` +
  String.raw`(?:using\s+|use\s+of\s+|the\s+use\s+of\s+|any\s+|a\s+|an\s+|the\s+|of\s+)*`;
const without = (text, what) => new RegExp(NEGATE + what).test(text);

const BUILTIN_NAMES = String.raw`(?:pow|sqrt|strlen|strrev|strcat|strcmp|strcpy|reverse|reversed|sort|sorted|toupper|tolower|upper|lower|len|length|abs|max|min|math\.\w+|slicing|\[::-1\])(?:\(\))?`;
const BUILTIN_WORDS = String.raw`(?:built[\s-]?in|inbuilt|library|predefined|pre[\s-]?defined|standard|std|string|math)`;

function loopStyle(text) {
  if (without(text, String.raw`(?:for\s+|while\s+)?loops?\b`)) return "none";
  if (/\bdo[\s-]*(?:\.\.\.\s*)?while\b/.test(text)) return "do-while";
  if (/\bwhile[\s-]*loops?\b|\b(?:using|with|use|in)\s+(?:a\s+)?while\b/.test(text)) return "while";
  if (/\bfor[\s-]*loops?\b|\b(?:using|with|use)\s+(?:a\s+)?for\b/.test(text)) return "for";
  return null;
}

function recursion(text) {
  if (
    without(text, "recursi(?:on|ve)") ||
    /\b(?:iterative(?:ly)?|non[\s-]?recursive(?:ly)?|iteration)\b/.test(text)
  ) {
    return false;
  }
  return /\brecursi(?:on|ve|vely)\b/.test(text) ? true : null;
}

function builtin(text) {
  if (
    without(text, `${BUILTIN_WORDS}\\s*(?:functions?|methods?|library|libraries)?\\b`) ||
    without(text, `${BUILTIN_NAMES}(?![\\w.])`) ||
    /\bmanually\b|\bfrom\s+scratch\b|\bby\s+hand\b|\bown\s+(?:logic|function|code)\b|\bmanual\s+(?:logic|method|way)\b/.test(
      text,
    )
  ) {
    return false;
  }
  if (
    new RegExp(
      String.raw`\b(?:using|use|with|via)\s+(?:the\s+|a\s+|an\s+)?${BUILTIN_WORDS}\s*(?:functions?|methods?|library)?\b`,
    ).test(text) ||
    new RegExp(String.raw`\b(?:using|use|with|via)\s+(?:the\s+)?${BUILTIN_NAMES}(?![\w.])`).test(
      text,
    )
  ) {
    return true;
  }
  return null;
}

function temp(text) {
  const extra = String.raw`(?:third|3rd|temp|temporary|extra|another|additional|helper|third[\s-]party)\s*(?:variables?|vars?)?\b`;
  if (without(text, extra)) return false;
  if (new RegExp(String.raw`\b(?:using|use|with)\s+(?:a\s+|the\s+)?${extra}`).test(text))
    return true;
  return null;
}

function input(text) {
  if (
    /\b(?:without|no|don'?t\s+(?:take|ask\s+for|read|use|need)|do\s+not\s+(?:take|ask\s+for|read|use))\s+(?:any\s+|taking\s+|the\s+|reading\s+)?(?:user\s+)?inputs?\b/.test(
      text,
    ) ||
    /\bhard[\s-]?cod(?:e|ed|ing)\b|\b(?:fixed|predefined|pre[\s-]?defined|static|constant|sample|example|default)\s+(?:values?|numbers?|data|inputs?|arrays?|strings?)\b/.test(
      text,
    ) ||
    /\bwithout\s+(?:asking|reading|taking|prompting)\b/.test(text)
  ) {
    return false;
  }
  if (
    /\b(?:user|keyboard|console|stdin|standard)\s+inputs?\b|\binputs?\s+from\s+(?:the\s+)?(?:user|keyboard|console)\b/.test(
      text,
    ) ||
    /\b(?:takes?|taking|accepts?|gets?|reads?|reading|asks?|asking|prompts?|enter|enters|entered|input|inputs)\s+(?:an?\s+|the\s+|two\s+|three\s+|\d+\s+|n\s+|some\s+|from\s+)?(?:input|number|numbers|value|values|integer|integers|string|text|name|word|sentence|character|year|marks|user|keyboard)\b/.test(
      text,
    ) ||
    /\b(?:entered|given|provided|typed)\s+by\s+(?:the\s+)?user\b|\bscanf\b|\bscanner\b|\bcin\b|\binput\(\)|\breadline\b/.test(
      text,
    )
  ) {
    return true;
  }
  return null;
}

function numberType(text) {
  if (
    /\bdecimal\s+(?:numbers?|values?|points?|places?|inputs?)\b|\b(?:decimals|floats?|floating[\s-]?point|doubles?|real\s+numbers?|fractions?|fractional|non[\s-]?integers?)\b/.test(
      text,
    )
  ) {
    return "double";
  }
  if (
    /\blong\s+(?:long|int|integers?|numbers?|values?|type)\b|\b(?:large|big|huge)\s+(?:numbers?|integers?|values?)\b|\b64[\s-]?bit\b|\bbigint\b|\buse\s+long\b/.test(
      text,
    )
  ) {
    return "long";
  }
  if (/\bintegers?\b|\bwhole\s+numbers?\b|\bints?\b/.test(text)) return "int";
  return null;
}

function algorithm(text) {
  const sort = text.match(/\b(bubble|selection|insertion|quick|merge)[\s-]*sort/);
  if (sort) return sort[1];
  const search = text.match(/\b(linear|sequential|binary)[\s-]*search/);
  if (search) return search[1] === "sequential" ? "linear" : search[1];
  return null;
}

function order(text) {
  if (
    /\bdescending\b|\bdecreasing\b|\bdesc\b|\breverse(?:d)?\s+(?:sorted\s+)?order\b|\b(?:largest|highest|biggest|greatest|high|big|max)\s+to\s+(?:smallest|lowest|least|low|small|min)\b|\bnon[\s-]?increasing\b/.test(
      text,
    )
  ) {
    return "desc";
  }
  if (
    /\bascending\b|\bincreasing\b|\basc\b|\b(?:smallest|lowest|least|low|small|min)\s+to\s+(?:largest|highest|biggest|greatest|high|big|max)\b|\bnon[\s-]?decreasing\b/.test(
      text,
    )
  ) {
    return "asc";
  }
  return null;
}

export function readFlags(text) {
  const negatedSwitch = without(text, String.raw`switch\b`);
  return {
    recursion: recursion(text),
    loop: loopStyle(text),
    func:
      /(?<![\w-])(?:using|with|use|create|write|define|make|in|via|through|by)\s+(?:a\s+|an\s+|the\s+)?(?:separate\s+|user[\s-]?defined\s+|custom\s+|own\s+|helper\s+|reusable\s+)?(?:functions?|methods?|procedures?|subroutines?)\b/.test(
        text,
      ) ||
      /\buser[\s-]?defined\s+(?:functions?|methods?)\b|\b(?:call|pass(?:ed)?)\s+by\s+(?:value|reference|address)\b|\b(?:functions?|methods?)\s+(?:named|called|that\s+(?:returns|takes|accepts|checks|calculates|finds|computes))\b/.test(
        text,
      ) ||
      /^(?:please\s+)?(?:write|create|make|give|show|implement|define)\s+(?:me\s+)?(?:an?\s+)?(?:\w+\s+){0,2}(?:functions?|methods?)\b/.test(
        text,
      ),
    byRef:
      /\b(?:call|pass(?:ed)?)\s+by\s+(?:reference|address)\b|\breference\s+(?:parameters?|variables?)\b/.test(
        text,
      ),
    array:
      /\barrays?\b|\bvectors?\b|\bslices?\b|\b(?:an?|the|in|into|of|using|from|to|with|given|python|integer|number)\s+lists?\b/.test(
        text,
      ),
    pointer: /\bpointers?\b/.test(text) && !without(text, String.raw`pointers?\b`),
    switch:
      !negatedSwitch &&
      /\bswitch(?:[\s-]*case)?(?:\s+statements?)?\b|\bmatch[\s-]+case\b|\bmatch\s+statements?\b|\bcase\s+statements?\b/.test(
        text,
      ),
    ternary:
      /\bternary\b|\bconditional\s+(?:operator|expression)\b|\?\s*:/.test(text) &&
      !without(text, "ternary"),
    ifElse:
      /\bif[\s-]*else\b|\bnested\s+if\b|\belse[\s-]*if\b|\bif\s+statements?\b|\bif\s+conditions?\b/.test(
        text,
      ),
    logical: /\blogical\s+(?:operators?|and|or)\b|&&|\|\|/.test(text),
    builtin: builtin(text),
    temp: temp(text),
    bitwise:
      /\bbitwise\b|\bxor\b|\bbit\s+(?:manipulation|operators?|operations?)\b|\bbits?\s+wise\b/.test(
        text,
      ),
    formula:
      /\bformula\b|\bmathematical(?:ly)?\b|\bclosed[\s-]form\b/.test(text) ||
      without(text, String.raw`(?:for\s+|while\s+)?loops?\b`),
    order: order(text),
    algorithm: algorithm(text),
    input: input(text),
    type: numberType(text),
    caseInsensitive:
      /\bcase[\s-]?insensitive(?:ly)?\b|\b(?:ignore|ignoring|regardless\s+of|irrespective\s+of)\s+(?:the\s+)?(?:upper\s*case\s+and\s+lower\s*case|letter\s+case|case|capitali[sz]ation)\b|\bnot\s+case[\s-]?sensitive\b/.test(
        text,
      ),
  };
}
