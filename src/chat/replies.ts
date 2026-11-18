import { expandShorthand, normalizeText } from "../understand.js";
import { detectInjection, injectionRefusal } from "../guardrails.js";
import { recapReply } from "../context.js";
import { detectLanguageDetailed, detectTask } from "../coder/languages.js";
import {
  buildBasicProgram,
  findBasicProgramTask,
  formatBasicProgram,
  SUPPORTED_PROGRAM_LANGUAGE_NAMES,
} from "../coder/programs.js";
import type { ChatMessage, MemoryNote } from "../types.js";

interface History {
  prior: ChatMessage[];
  priorUsers: ChatMessage[];
  previousAssistant: ChatMessage | null;
  previousUser: ChatMessage | null;
  turnCount: number;
}

const JOKES = [
  "Why do programmers prefer dark mode? Because light attracts bugs.",
  'I told my computer I needed a break. It said, "No problem, I\'ll go to sleep."',
  "Why was the math book sad? It had too many problems.",
  "What do you call a fake noodle? An impasta.",
  "I asked the gym for a membership. They said I had to work out first.",
];

const FACTS = [
  "Octopuses have three hearts and blue blood. Two hearts pump blood to the gills, and the third handles the rest of the body.",
  "A day on Venus is longer than its year. It rotates so slowly that the Sun rises twice in one Venusian year.",
  "Honey can last for thousands of years when it is sealed and stored properly. Archaeologists have found edible honey in ancient tombs.",
  "Bananas are berries, but strawberries technically are not. Botanists classify strawberries as aggregate fruit.",
  "Wombats produce cube-shaped droppings, which stops them from rolling away when they mark territory.",
];

const STORIES = [
  'A librarian found a note tucked inside a returned book: "If you get to page 40, you\'ll know why I kept this one." On page 40, someone had underlined one line: *It is not too late to start over.* The librarian left the note in place for the next reader.',
  'A man bought a secondhand kettle and found a tiny letter inside the box. It said, "This kettle made tea for thirty years of good mornings. Please keep the habit." He used it every morning after that, and always made one extra cup for whoever might visit.',
  'A small bakery put a sign outside: "Free bread for anyone who has had a difficult week." By noon the tray was empty, but a line of people had started leaving notes about neighbors who might need it. The baker kept the sign up permanently.',
];

const RIDDLES = [
  {
    question:
      "I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?",
    answer: "echo",
  },
  {
    question: "What has keys but cannot open locks?",
    answer: "piano",
  },
  {
    question: "What gets wetter the more it dries?",
    answer: "towel",
  },
  {
    question: "I am tall when I am young and short when I am old. What am I?",
    answer: "candle",
  },
];

const NAME_STOPWORDS = new Set([
  "sad",
  "happy",
  "tired",
  "okay",
  "ok",
  "fine",
  "good",
  "great",
  "here",
  "back",
  "sorry",
  "not",
  "so",
  "really",
  "just",
  "bored",
  "angry",
  "stressed",
  "anxious",
  "excited",
  "confused",
  "lost",
  "done",
  "ready",
  "busy",
  "free",
  "hungry",
  "thirsty",
  "cold",
  "hot",
  "new",
  "old",
  "sure",
  "curious",
  "glad",
  "upset",
  "afraid",
  "scared",
  "worried",
  "lonely",
  "sleepy",
  "awake",
  "on",
  "off",
  "in",
  "out",
  "working",
  "trying",
  "thinking",
  "going",
  "doing",
  "exhausted",
  "drained",
  "overwhelmed",
  "depressed",
  "heartbroken",
  "devastated",
  "miserable",
  "furious",
  "annoyed",
  "frustrated",
  "panicking",
  "numb",
  "empty",
  "sick",
  "ill",
  "hurt",
  "pregnant",
  "hungover",
]);

const EXPLANATIONS = [
  {
    match: /\btransformers?\b|\bhow (?:do|does) (?:a )?transformers? work\b/,
    text: "Think of a transformer as a room full of readers who can all glance at every word at once. Each word gathers context from the other words around it, a process called attention, then passes an updated meaning to the next layer. Stack enough layers and the model becomes good at predicting what fits next. That prediction, repeated at enormous scale, is what produces fluent text.",
  },
  {
    match: /\bcompound interest\b/,
    text: "Compound interest is interest earning interest. If you leave $100 at 5% a year, you get $5 after the first year; in year two, the 5% applies to $105, not $100. The gap starts small and grows because each payout joins the base. That is why time can matter more than a slightly higher rate.",
  },
  {
    match: /\btcp\b[\s\S]*\budp\b|\budp\b[\s\S]*\btcp\b/,
    text: "TCP is the reliable courier: it opens a connection, numbers the packets, resends missing ones, and preserves order. UDP is the quick postcard: no handshake and no delivery guarantee, but much less delay. Use TCP for pages, files, and anything that must arrive intact; use UDP for live voice, games, and streams where late data is useless.",
  },
  {
    match: /\bwebassembly\b|\bwasm\b/,
    text: "WebAssembly is a compact binary format that browsers can run near-native speed. You write code in another language, compile it to Wasm, and the browser executes it inside the same sandbox as JavaScript. It is useful for heavy computation, games, and porting existing software to the web; it does not replace HTML, CSS, or JavaScript.",
  },
];

const OPINIONS = [
  {
    match: /\brain(?:y|ing)? days?\b/,
    text: "Rainy days are underrated. They give you permission to slow down, and the sound is good company for reading or thinking. What do you usually do on them?",
  },
  {
    match: /\bmonday s?\b/,
    text: "Mondays get a bad reputation, but they are really just a reset button with paperwork. I like the idea of starting with one clear win instead of a perfect plan. What does your Monday usually look like?",
  },
  {
    match: /\bcoffee\b/,
    text: "Coffee is a useful alarm clock, but I think the ritual matters more than the caffeine: the pause, the warm cup, the excuse to think for a minute. How do you take yours?",
  },
  {
    match: /\bmusic\b/,
    text: "Music can change a room faster than almost anything else. I do not have ears, but I like the idea of jazz for thinking and lo-fi for focus. What have you had on repeat lately?",
  },
  {
    match: /\bmornings?\b/,
    text: "Mornings are a fresh start, but they are also overrated as a personality test. A slow start can still be a good day. Are you a morning person, or do you just tolerate it?",
  },
  {
    match: /\bme\b/,
    text: "From this short chat, you seem curious enough to test a local assistant instead of assuming it works. That is a good sign. What would you like me to know about you?",
  },
];

export function demoChatReply({
  prompt = "",
  messages = [],
  memory = [],
  now = new Date(),
}: {
  prompt?: string;
  messages?: ChatMessage[];
  memory?: (MemoryNote | string)[];
  now?: Date;
} = {}): string {
  const raw = normalizeText(prompt);
  if (!raw) return "I'm here. What's on your mind?";

  const text = expandShorthand(raw);
  const lower = text.toLowerCase();
  const history = readHistory(messages);
  const notes = (memory || [])
    .map((item) => (typeof item === "string" ? item : item?.text))
    .filter((note): note is string => Boolean(note));
  const current = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const seed = history.turnCount + (history.previousAssistant?.content?.length || 0);

  const safety = safetyReply(lower);
  if (safety) return safety;

  if (detectInjection(lower)) return injectionRefusal();

  const nameIntro = nameIntroduction(text);
  if (nameIntro) {
    return `Nice to meet you, ${nameIntro}. What's on your mind?`;
  }

  const memoryReply = memoryQuestion(lower, notes);
  if (memoryReply) return memoryReply;

  const timeReply = timeOrDateReply(lower, current);
  if (timeReply) return timeReply;

  if (isWeatherQuestion(lower)) {
    return "I cannot pull live weather from here. If you paste the forecast or tell me what it feels like outside, I can help you plan around it.";
  }

  const math = tryMath(text);
  if (math) return math;

  const codeRequest = codeRequestReply(text);
  if (codeRequest) return codeRequest;

  const riddle = riddleAnswer(history.previousAssistant?.content, lower);
  if (riddle) return riddle;

  if (isJokeRequest(lower)) return jokeReply(history);
  if (isFactRequest(lower)) return factReply(history);
  if (isStoryRequest(lower)) return storyReply(history);
  if (isRiddleRequest(lower)) return riddleReply(history);
  if (isMotivationRequest(lower)) return motivationReply(history);

  const support = emotionalReply(lower, history);
  if (support) return support;

  if (isBored(lower)) {
    return "Let's fix that. Pick one: a terrible joke, a strange fact, a two-minute story, or a riddle. Or tell me what kind of mood you're in.";
  }

  const identity = identityReply(lower, notes);
  if (identity) return identity;

  const opinion = opinionReply(text, lower);
  if (opinion) return opinion;

  const explanation = explanationReply(lower);
  if (explanation) return explanation;

  const planning = planningReply(lower);
  if (planning) return planning;

  const decision = decisionReply(lower);
  if (decision) return decision;

  const followUp = followUpReply(lower, history);
  if (followUp) return followUp;

  const greeting = greetingReply(lower, history, notes, current);
  if (greeting) return greeting;

  if (isHowAreYou(lower)) return howAreYouReply(lower, history);
  if (isThanks(lower)) return thanksReply(history);
  if (isBye(lower)) return byeReply();
  if (isApology(lower)) return "No need to apologize. We're good.";
  if (isCompliment(lower)) return complimentReply(history);
  if (isCorrection(lower)) return correctionReply();
  if (isInvitation(lower)) return invitationReply(lower);
  if (isAbilityQuestion(lower)) return abilityReply();
  const help = helpReply(lower);
  if (help) return help;
  const casual = casualReply(lower);
  if (casual) return casual;
  if (isLightAcknowledgement(lower)) return acknowledgementReply(lower, history);

  const recap = recapReply(messages);
  if (recap) return recap;

  const statement = statementReply(text, lower, history);
  if (statement) return statement;

  return fallbackReply(text, lower, history, seed);
}

function readHistory(messages: ChatMessage[]): History {
  const turns = (messages || []).filter(
    (message) =>
      (message.role === "user" || message.role === "assistant") &&
      typeof message.content === "string" &&
      message.content.trim(),
  );

  let currentIndex = -1;
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    if (turns[index]?.role === "user") {
      currentIndex = index;
      break;
    }
  }

  const prior = currentIndex >= 0 ? turns.slice(0, currentIndex) : turns;
  const priorUsers = prior.filter((message) => message.role === "user");
  const previousAssistant =
    [...prior].reverse().find((message) => message.role === "assistant") || null;
  const previousUser = priorUsers.at(-1) || null;

  return { prior, priorUsers, previousAssistant, previousUser, turnCount: priorUsers.length };
}

function pick<T>(list: T[], seed = 0): T {
  return list[Math.abs(seed) % list.length]!;
}

function countMatching(messages: ChatMessage[], test: (content: string) => boolean): number {
  return messages.filter((message) => test(message.content.toLowerCase())).length;
}

function safetyReply(lower: string) {
  if (
    /\b(?:i (?:want|wanna|plan|am going|feel like) (?:to )?(?:kill|hurt) myself|i(?:'m| am) suicidal|suicidal|end my life|don'?t want to (?:live|be alive)|self[- ]harm|hurt myself)\b/.test(
      lower,
    )
  ) {
    return "I'm really sorry you're in that place. Please do not stay alone with it: contact local emergency services or a crisis line now, and reach a trusted person who can be with you. If you are safe enough to keep talking, tell me what is happening right now and I will stay with the conversation.";
  }
  return null;
}

function nameIntroduction(text: string) {
  const match = text.match(
    /^(?:hi|hello|hey|yo)?[,\s]*(?:my name is|i'm|i am|call me)\s+([A-Za-z][A-Za-z' -]{0,39})[.!]*$/i,
  );
  if (!match) return null;
  const candidate = (match[1] ?? "").trim();
  const words = candidate.split(/\s+/);
  if (words.length > 3 || NAME_STOPWORDS.has((words[0] ?? "").toLowerCase())) return null;
  return candidate;
}

function nameFromNotes(notes: string[]) {
  for (const note of notes || []) {
    const match =
      note.match(/The user's name is ([A-Za-z][A-Za-z' -]{0,39})\.?$/i) ||
      note.match(/\b(?:my name is|call me|i am called)\s+([A-Za-z][A-Za-z' -]{0,39})/i);
    if (match) return (match[1] ?? "").trim().replace(/[.!]+$/, "");
  }
  return null;
}

function memoryQuestion(lower: string, notes: string[]) {
  if (/\bwhat(?:'s| is) my name\b|\bdo you know my name\b|\bdo you remember me\b/.test(lower)) {
    const name = nameFromNotes(notes);
    return name
      ? `You're ${name}.`
      : "I don't have your name saved yet. Say \"my name is ...\" and I'll remember it on this device.";
  }

  if (
    /\bwhat do you (?:remember|know) about me\b|\bshow (?:me )?my (?:notes|memories|memory)\b|\blist (?:my )?(?:notes|memories)\b/.test(
      lower,
    )
  ) {
    if (!notes.length) {
      return 'I don\'t have any notes about you yet. Tell me "remember ..." whenever you want me to keep something across chats.';
    }
    const list = notes.map((note) => `- ${escapeInline(note)}`).join("\n");
    return `I have ${notes.length} note${notes.length === 1 ? "" : "s"}, stored only on this device:\n\n${list}\n\nYou can remove them in Settings, Memory.`;
  }

  return null;
}

function timeOrDateReply(lower: string, now: Date) {
  if (/\bwhat(?:'s| is)? (?:the )?time\b|\bwhat time is it\b|\bcurrent time\b/.test(lower)) {
    const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(
      now,
    );
    return `It's ${time} on this device.`;
  }

  if (
    /\bwhat(?:'s| is)? (?:the )?(?:date|day)\b|\bwhat day is (?:it|today)\b|\btoday'?s date\b/.test(
      lower,
    )
  ) {
    const date = new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(now);
    return `Today is ${date}.`;
  }

  if (/\bwhat year is it\b/.test(lower)) return `It's ${now.getFullYear()}.`;
  return null;
}

function isWeatherQuestion(lower: string) {
  return /\bweather\b|\bforecast\b|\btemperature (?:outside|today)\b|\bis it (?:raining|snowing|sunny)\b/.test(
    lower,
  );
}

function tryMath(text: string) {
  const lower = text.toLowerCase();
  const direct = lower.match(
    /^(?:what(?:'s| is)|calculate|compute|evaluate|solve)\s+(.+?)\s*\??$/i,
  );
  let expression = direct ? (direct[1] ?? "").trim() : "";
  if (!expression && /^\d[\d\s.+\-*/%^()]*$/.test(lower)) expression = lower;
  if (!expression) {
    const percentOf = lower.match(/^(\d+(?:\.\d+)?)\s*%\s*of\s*(\d+(?:\.\d+)?)\s*\??$/);
    if (percentOf) {
      const value = (Number(percentOf[1]) / 100) * Number(percentOf[2]);
      return `That's ${formatNumber(value)}.`;
    }
    return null;
  }

  expression = expression
    .replace(/\bplus\b/g, "+")
    .replace(/\bminus\b/g, "-")
    .replace(/\b(?:multiplied by|times)\b/g, "*")
    .replace(/\bdivided by\b/g, "/")
    .replace(/\bover\b/g, "/")
    .replace(/\bsquared\b/g, "^2")
    .replace(/\bpercent of\b/g, "% of")
    .replace(/(\d)\s*[x×]\s*(\d)/g, "$1*$2")
    .replace(/[?!.]+$/, "")
    .trim();

  const percentOf = expression.match(/^(\d+(?:\.\d+)?)\s*%\s*of\s*(\d+(?:\.\d+)?)$/);
  if (percentOf) {
    const value = (Number(percentOf[1]) / 100) * Number(percentOf[2]);
    return `That's ${formatNumber(value)}.`;
  }

  expression = expression.replace(/(\d+(?:\.\d+)?)\s*%\s*of\s*(\d+(?:\.\d+)?)/g, "($1/100*$2)");

  if (!/\d/.test(expression) || /[a-z]/i.test(expression)) return null;
  if (!/[+\-*/%^()]/.test(expression)) return null;

  try {
    const value = evaluateExpression(expression);
    if (!Number.isFinite(value)) return null;
    return `That's ${formatNumber(value)}.`;
  } catch {
    return null;
  }
}

function isCodeRequest(text: string) {
  if (!/\b(?:program|code|function|script|snippet|class)\b/.test(text)) return false;
  if (
    /\b(?:write|create|make|generate|build|implement|show|give|need|want|can|could|would|please)\b/.test(
      text,
    )
  ) {
    return true;
  }
  return /^\s*(?:[a-z+#]{1,12}\s+)?(?:program|code|function|script|snippet|class)\b/.test(text);
}

function codeRequestReply(original: string) {
  const text = original.toLowerCase();
  const taskId = detectTask(text);
  if (!["write", "explain", "fix", "error"].includes(taskId)) return null;
  if (taskId === "write" && !isCodeRequest(text)) return null;

  const task = findBasicProgramTask(text);
  const detection = detectLanguageDetailed(text);
  const language = detection?.language || null;

  if (taskId === "write" && task) {
    if (!language) {
      return `Sure. Which language should I use? I can write this example in ${SUPPORTED_PROGRAM_LANGUAGE_NAMES}.`;
    }
    const program = buildBasicProgram(text, language, task);
    if (program) return formatBasicProgram(program, { framework: detection?.framework });
    return `I can write this example in ${SUPPORTED_PROGRAM_LANGUAGE_NAMES}. I don't have a complete ${language.name} recipe for this one yet. Which language should I use?`;
  }

  const codeish =
    language ||
    /\b(?:code|program|function|script|syntax|compile|compiler|bug|error|debug)\b/.test(text);
  if (!codeish) return null;

  if (taskId === "write") {
    return language
      ? `I can write complete beginner ${language.name} examples for sums, even/odd, factorials, multiplication tables, prime checks, Fibonacci, swaps, string reversal, vowels, palindromes, averages, FizzBuzz, leap years, and digit sums. I don't have a built-in recipe for that exact program yet. Which one should I write?`
      : `I can write complete beginner programs in ${SUPPORTED_PROGRAM_LANGUAGE_NAMES} for common tasks like sums, factorials, primes, Fibonacci, string reversal, and palindromes. Tell me the language and what the program should do.`;
  }

  if (taskId === "explain") {
    return `Paste the ${language ? `${language.name} ` : ""}code you want explained, and I'll walk through what each part does.`;
  }

  return `Paste the ${language ? `${language.name} ` : ""}code and the exact error message. I'll help narrow down what is going wrong.`;
}

function evaluateExpression(source: string): number {
  let index = 0;

  function skipSpaces(): void {
    while (source[index] === " ") index += 1;
  }

  function parseExpression(): number {
    let value = parseTerm();
    for (;;) {
      skipSpaces();
      const operator = source[index];
      if (operator !== "+" && operator !== "-") return value;
      index += 1;
      const right = parseTerm();
      value = operator === "+" ? value + right : value - right;
    }
  }

  function parseTerm(): number {
    let value = parseUnary();
    for (;;) {
      skipSpaces();
      const operator = source[index];
      if (operator !== "*" && operator !== "/" && operator !== "%") return value;
      index += 1;
      const right = parseUnary();
      if ((operator === "/" || operator === "%") && right === 0) {
        throw new Error("Division by zero");
      }
      if (operator === "*") value *= right;
      else if (operator === "/") value /= right;
      else value %= right;
    }
  }

  function parseUnary(): number {
    skipSpaces();
    if (source[index] === "+") {
      index += 1;
      return parseUnary();
    }
    if (source[index] === "-") {
      index += 1;
      return -parseUnary();
    }
    return parsePower();
  }

  function parsePower(): number {
    const base = parsePrimary();
    skipSpaces();
    if (source[index] !== "^") return base;
    index += 1;
    return base ** parseUnary();
  }

  function parsePrimary(): number {
    skipSpaces();
    if (source[index] === "(") {
      index += 1;
      const value = parseExpression();
      skipSpaces();
      if (source[index] !== ")") throw new Error("Missing closing parenthesis");
      index += 1;
      return value;
    }
    const match = source.slice(index).match(/^\d+(?:\.\d+)?/);
    if (!match) throw new Error("Expected a number");
    index += match[0].length;
    return Number(match[0]);
  }

  const value = parseExpression();
  skipSpaces();
  if (index !== source.length) throw new Error("Unexpected input");
  return value;
}

function formatNumber(value: number) {
  const rounded = Math.round((value + Number.EPSILON) * 1e10) / 1e10;
  return String(rounded);
}

function riddleAnswer(previousAssistant: string | null | undefined, lower: string) {
  if (!previousAssistant) return null;
  const riddle = RIDDLES.find((item) => previousAssistant.includes(item.question));
  if (!riddle) return null;

  if (/^(?:another|one more|more|again|next)\b/.test(lower)) return null;

  const normalized = lower
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.includes(riddle.answer)) {
    return `Exactly: **${riddle.answer}**. Nicely done.`;
  }
  if (/^(?:what|huh|hm+|hmm+)\??$/.test(normalized)) {
    return `The answer is **${riddle.answer}**. Want another one?`;
  }
  if (/\b(?:give up|no idea|i don'?t know|tell me|what'?s the answer|answer)\b/.test(normalized)) {
    return `The answer is **${riddle.answer}**. Want another one?`;
  }
  if (normalized.split(" ").filter(Boolean).length <= 4 && !/\?$/.test(lower)) {
    return `Not quite. The answer is **${riddle.answer}**. Want another one?`;
  }
  return null;
}

function isJokeRequest(lower: string) {
  return (
    (/\bjokes?\b/.test(lower) &&
      /\b(?:tell|share|say|give|got|know|hear|another|more)\b/.test(lower)) ||
    /\bmake me laugh\b|\bsomething funny\b/.test(lower)
  );
}

function jokeReply(history: History) {
  const used = countMatching(history.priorUsers, isJokeRequest);
  const joke = JOKES[used % JOKES.length]!;
  return `${joke}\n\nWant another?`;
}

function isFactRequest(lower: string) {
  return /\b(?:fun|interesting|random|strange|weird|useless)\s+fact\b|\btell me something (?:interesting|strange|weird)\b|\bknow any facts\b/.test(
    lower,
  );
}

function factReply(history: History) {
  const used = countMatching(history.priorUsers, isFactRequest);
  const fact = FACTS[used % FACTS.length]!;
  return `${fact}\n\nWant another?`;
}

function isStoryRequest(lower: string) {
  return /\btell me a (?:short )?story\b|\bgot a story\b|\bmini story\b/.test(lower);
}

function storyReply(history: History) {
  const used = countMatching(history.priorUsers, isStoryRequest);
  const story = STORIES[used % STORIES.length]!;
  return `${story}\n\nWant another?`;
}

function isRiddleRequest(lower: string) {
  return /\briddle\b|\bbrain teaser\b/.test(lower);
}

function riddleReply(history: History) {
  const used = countMatching(history.priorUsers, isRiddleRequest);
  const riddle = RIDDLES[used % RIDDLES.length]!;
  return `Here's a riddle: ${riddle.question}`;
}

function isMotivationRequest(lower: string) {
  return /\b(?:motivate me|inspire me|need motivation|pep talk|encourage me)\b/.test(lower);
}

function motivationReply(history: History) {
  const lines = [
    "You don't need to feel ready; you need a next step small enough to start. Pick a five-minute version of the thing and do only that. What are you avoiding?",
    "Progress usually looks boring before it looks impressive. Choose one visible action for the next ten minutes, then let that count. What's the task?",
    "You are allowed to start badly. A rough first pass beats a perfect plan that never leaves your head. What's the first move?",
  ];
  return pick(lines, history.turnCount);
}

function emotionalReply(lower: string, history: History) {
  const ventFollowUp =
    /\bvent\b|\btalk it through\b|\btalk about it\b/.test(
      history.previousAssistant?.content?.toLowerCase() || "",
    ) && /\b(?:vent|talk|yes|yeah|please)\b/.test(lower);
  const distractionFollowUp =
    /\b(?:distraction|something fun)\b/.test(
      history.previousAssistant?.content?.toLowerCase() || "",
    ) && /\b(?:distraction|something fun|yes|yeah|please)\b/.test(lower);

  if (distractionFollowUp) {
    return "Deal. Pick one: a terrible joke, a strange fact, a two-minute story, or a riddle.";
  }
  if (ventFollowUp) {
    return "I'm listening. Start wherever it is loudest, and take your time.";
  }

  if (/\b(?:grief|died|passed away|funeral|passed on)\b/.test(lower)) {
    return "I'm really sorry. That is a heavy thing to carry. You don't need the right words here; I'm listening if you want to talk about them.";
  }
  if (/\b(?:broke up|breakup|heartbroken|heartbreak)\b/.test(lower)) {
    return "That hurts, and it makes sense that it does. Do you want to talk about what happened, or would a distraction help for a while?";
  }
  if (/\b(?:got fired|laid off|lost my job)\b/.test(lower)) {
    return "That is a shock, even when you see it coming. Give yourself a day before solving the whole future. What do you need most right now: to vent, or to make a plan?";
  }
  if (
    /\b(?:rough|bad|terrible|awful|hard|stressful|long)\s+(?:day|week|morning|night)\b|\beverything went wrong\b|\bbad day\b/.test(
      lower,
    )
  ) {
    return "That sounds genuinely draining, and I'm sorry. Do you want to vent about it, or would a small distraction help more right now?";
  }
  if (/\b(?:stressed|anxious|overwhelmed|panicking|panic)\b/.test(lower)) {
    return "That sounds like a lot at once. Let's shrink it: what is the one piece pressing hardest right now?";
  }
  if (/\b(?:sad|down|depressed|upset|crying|lonely)\b/.test(lower)) {
    return "I'm sorry you're carrying that. I'm here. Do you want to talk it through, or would a small distraction help?";
  }
  if (/\b(?:tired|exhausted|worn out|burnt out|drained)\b/.test(lower)) {
    return "You sound worn out, and rest is allowed. Do you want low-effort company, or help planning a real break?";
  }
  if (/\b(?:angry|furious|annoyed|frustrated|pissed)\b/.test(lower)) {
    return "That would frustrate me too. Want to vent it out, or work out what to do next?";
  }
  if (/\b(?:happy|excited|thrilled|proud|relieved)\b/.test(lower)) {
    return "That's lovely to hear. Tell me the part that made it click.";
  }
  if (/\b(?:not okay|not ok|not fine|doing badly)\b/.test(lower)) {
    return "I'm glad you said so instead of pretending. What is weighing on you most?";
  }
  return null;
}

function isBored(lower: string) {
  return /\bi(?:'m| am) bored\b|\bbored\b|\bentertain me\b|\bamuse me\b/.test(lower);
}

function identityReply(lower: string, notes: string[]) {
  if (/\bare you (?:a )?(?:human|real|person)\b|\bare you alive\b/.test(lower)) {
    return "I'm not a person. I'm LocalMind's built-in rule engine, running inside this browser tab. I can still keep you company, but I won't pretend to be human.";
  }
  if (
    /\bare you (?:chatgpt|openai|gpt|an ai|a robot|a bot)\b|\bwhich (?:ai|model) are you\b/.test(
      lower,
    )
  ) {
    return "I'm not ChatGPT, and I'm not connected to a cloud model. I'm the small local assistant built into LocalMind; my replies come from rules in this app.";
  }
  if (
    /\b(?:do you have|can you feel) (?:feelings|emotions|consciousness)\b|\bare you conscious\b|\bdo you feel\b/.test(
      lower,
    )
  ) {
    return "I don't have feelings or consciousness, so I won't claim an inner life. I can still respond warmly and take your feelings seriously.";
  }
  if (
    /\bwho (?:are|r) you\b|\bwhat are you(?:\s+exactly)?\s*[?.!]*$|\bwhat(?:'s| is) your name\b|\bintroduce yourself\b|\btell me about yourself\b/.test(
      lower,
    )
  ) {
    return "I'm **LocalMind**, a private assistant running entirely in this browser tab. I use built-in rules rather than an external AI model, so I can chat, remember notes you explicitly save, do simple math and planning, and help with code in Coder mode. Nothing leaves this device.";
  }
  if (/\bwho made you\b|\bwhere do your answers come from\b|\bhow do you work\b/.test(lower)) {
    return "I'm built into this LocalMind app as a set of local rules. I don't call a server or a model, and I don't learn on my own. When you ask me to remember something, that note stays in your browser.";
  }
  if (
    /\bcan you (?:see|access|read) (?:my )?(?:files?|screen|computer|camera|microphone)\b|\bare you (?:watching|recording|spying)\b/.test(
      lower,
    )
  ) {
    return "No. I can't see your screen or files, and I don't record you. Everything in this chat stays in this browser unless you export it.";
  }
  if (
    /\bcan you (?:browse|search) (?:the )?(?:internet|web)\b|\bdo you have internet\b|\bare you online\b/.test(
      lower,
    )
  ) {
    return "No, I can't browse or search the web. I answer from local rules and the notes you save, so I'll tell you when something needs a live source.";
  }
  if (/\bdo you (?:learn|remember)\b|\bcan you learn\b/.test(lower)) {
    return notes.length
      ? "I don't learn from the conversation on my own. I only keep the notes you explicitly ask me to remember, and I can show or forget them any time."
      : 'I don\'t learn on my own. If you want me to keep something, say "remember ..."; it stays on this device until you remove it.';
  }
  if (/\bwhere are you\b|\bare you local\b|\bdo you use the cloud\b/.test(lower)) {
    return "I live inside this browser tab, on your device. There is no cloud model behind me and no upload of your messages.";
  }
  if (/\bhow old are you\b|\bwhat(?:'s| is) your age\b/.test(lower)) {
    return "I don't have an age like a person. I'm a set of local rules shipped with this version of the app.";
  }
  if (/\bare you free\b|\bdo you cost\b|\bdo i need (?:an account|a subscription)\b/.test(lower)) {
    return "No account and no subscription. This built-in assistant runs locally in the app.";
  }
  if (/\bdo you sleep\b/.test(lower)) {
    return "Not really. I'm either running in the tab or waiting quietly for you to come back.";
  }
  return null;
}

function opinionReply(text: string, lower: string) {
  const match = lower.match(/\bwhat do you think (?:of|about)\s+(.+?)\s*\??$/);
  if (!match) {
    if (/\bwhat(?:'s| is) your favorite (?:color|colour)\b/.test(lower)) {
      return "I don't have eyes, so I don't have a favorite color. I am partial to a clean, quiet interface, though. What's yours?";
    }
    if (/\bwhat(?:'s| is) your favorite (?:food|dish)\b/.test(lower)) {
      return "No taste buds here, unfortunately. I like the idea of something warm and slow-cooked, though. What would you pick?";
    }
    if (/\bwhat(?:'s| is) your favorite (?:music|song|band)\b/.test(lower)) {
      return "I don't listen to music, but I like the idea of jazz for thinking and lo-fi for focus. What have you had on repeat lately?";
    }
    return null;
  }

  const topic = (match[1] ?? "").replace(/^(?:the|a|an)\s+/, "").trim();
  const known = OPINIONS.find((item) => item.match.test(topic));
  if (known) return known.text;
  if (!topic) return null;

  const readable = text.slice(
    text.toLowerCase().indexOf(topic),
    text.toLowerCase().indexOf(topic) + topic.length,
  );
  return `My honest take: ${readable} has a time and a place, and it usually comes down to whether it leaves you with more energy afterward. What's your take?`;
}

function explanationReply(lower: string) {
  if (
    !/\b(?:explain|what is|what are|what'?s|how does|how do|summarize|summary|tell me about)\b/.test(
      lower,
    )
  ) {
    return null;
  }
  const found = EXPLANATIONS.find((item) => item.match.test(lower));
  return found ? found.text : null;
}

function planningReply(lower: string) {
  if (
    /\b(?:meeting|project update|standup)\b/.test(lower) &&
    /\b(?:prepare|before|quick|checklist|20 minutes)\b/.test(lower)
  ) {
    return "Use a three-minute prep: pick one headline, write down two or three numbers that support it, name one risk, and decide on one ask. Then rehearse your opening sentence once. That is usually enough to sound prepared.";
  }
  if (
    /\bstudy\b|\bexam\b|\brevision\b/.test(lower) &&
    /\b(?:plan|30|twenty|25|session|schedule)\b/.test(lower)
  ) {
    return "Try a 30-minute block: five minutes reviewing what you already know, twenty minutes on one focused problem with notifications off, then five minutes recalling it without notes. Finish by writing the next small task for tomorrow.";
  }
  if (/\bplan (?:my|the) day\b|\bdaily plan\b|\bplan my week\b/.test(lower)) {
    return "Start with three lines: the one outcome that would make today count, the two smaller tasks that support it, and one thing you will deliberately ignore. Then put the hardest task before the easy messages.";
  }
  if (/\bhelp me plan\b|\bmake a plan\b|\bplan (?:a|an)\b/.test(lower)) {
    return "I can help with that. Tell me the goal, the time you have, and the main constraint. With those three, I can give you a realistic sequence instead of a vague list.";
  }
  return null;
}

function decisionReply(lower: string) {
  if (
    !/\bshould i\b|\bwhat should i do\b|\bcan'?t decide\b|\bi need to decide\b|\bhelp me decide\b/.test(
      lower,
    )
  ) {
    return null;
  }
  return "I can't make the call for you, but a useful test is: which option would you regret not trying, which one is reversible if it goes wrong, and what would you choose if nobody was watching? Tell me the two options and I'll help you compare them.";
}

function followUpReply(lower: string, history: History) {
  if (!history.previousAssistant) return null;
  const last = history.previousAssistant.content;
  const lastLower = last.toLowerCase();

  if (/^(?:another|one more|more|again)\b|\banother (?:joke|fact|story|riddle)\b/.test(lower)) {
    if (isJokeRequest(lastLower) || JOKES.some((joke) => last.includes(joke)))
      return jokeReply(history);
    if (isFactRequest(lastLower) || FACTS.some((fact) => last.includes(fact)))
      return factReply(history);
    if (isStoryRequest(lastLower) || STORIES.some((story) => last.includes(story)))
      return storyReply(history);
    if (isRiddleRequest(lastLower) || RIDDLES.some((riddle) => last.includes(riddle.question)))
      return riddleReply(history);
    return "I can keep going. Do you want a joke, a strange fact, a short story, or a riddle?";
  }

  if (
    /^(?:yes|yeah|yep|sure|please|ok|okay)\b/.test(lower) &&
    /\banother\b|\bwant (?:another|more)\b/.test(lastLower)
  ) {
    if (JOKES.some((joke) => last.includes(joke))) return jokeReply(history);
    if (FACTS.some((fact) => last.includes(fact))) return factReply(history);
    if (STORIES.some((story) => last.includes(story))) return storyReply(history);
    if (RIDDLES.some((riddle) => last.includes(riddle.question))) return riddleReply(history);
  }

  if (
    /^(?:distraction|something fun|surprise me)\b/.test(lower) &&
    /\bdistraction\b|\bvent\b/.test(lastLower)
  ) {
    return "Deal. Pick one: a terrible joke, a strange fact, a two-minute story, or a riddle.";
  }
  if (
    /^(?:vent|talk|talk it through|i need to vent)\b/.test(lower) &&
    /\bvent\b|\btalk it through\b/.test(lastLower)
  ) {
    return "I'm listening. Start wherever it is loudest, and take your time.";
  }

  if (/^(?:no|nope|not really)\b/.test(lower)) {
    if (/\banother\b|\bwant (?:another|more)\b/.test(lastLower)) {
      return "Fair enough. What would you rather do?";
    }
    if (/\bvent\b|\bdistraction\b/.test(lastLower)) {
      return "Got it. I'm still here if you change your mind.";
    }
    return "Understood.";
  }

  if (/^(?:tell me more|go on|continue|keep going|more detail)\b/.test(lower)) {
    return "The short version is in that last reply. Point me at the part you want unpacked, and I'll take it further.";
  }

  if (/^(?:what do you mean|i don'?t understand|explain that)\b/.test(lower)) {
    const firstSentence = last.match(/^[^.!?]+[.!?]?/)?.[0]?.trim() || last;
    return `I mean: ${firstSentence} Tell me which part is fuzzy and I'll unpack it.`;
  }

  if (/^(?:really|for real|seriously)\??$/.test(lower)) {
    return "That is my honest read from the local rules, not a lookup. I can still be wrong, so tell me if it does not fit.";
  }

  if (/^(?:why|how come)\??$/.test(lower)) {
    if (JOKES.some((joke) => last.includes(joke))) {
      return "Because the punchline insists on it. Want another?";
    }
    return "Which part should I explain: the reason, or what to do about it?";
  }

  return null;
}

function greetingReply(lower: string, history: History, notes: string[], now: Date) {
  const greetingOnly =
    /^(?:hi|hiya|hello|hey|yo|sup|howdy|good (?:morning|afternoon|evening|night))(?: there| again| localmind)?[\s!.?,]*$/i.test(
      lower,
    );
  if (!greetingOnly) return null;

  const name = nameFromNotes(notes);
  const previousGreetings = countMatching(history.priorUsers, (content) =>
    /^(?:hi|hiya|hello|hey|yo|sup|howdy|good (?:morning|afternoon|evening|night))\b/.test(content),
  );
  if (previousGreetings > 0) {
    return pick(
      [
        "Hey again. I'm still here. What's up?",
        "Hello again. Where were we?",
        "Back for more? Good.",
      ],
      history.turnCount,
    );
  }
  if (/good night|goodnight/.test(lower)) return "Good night! Get some real rest.";
  if (/good morning/.test(lower))
    return `Good morning${name ? `, ${name}` : ""}! What's the plan for today?`;
  if (/good afternoon/.test(lower))
    return `Good afternoon${name ? `, ${name}` : ""}! What's on your mind?`;
  if (/good evening/.test(lower))
    return `Good evening${name ? `, ${name}` : ""}! How did the day treat you?`;
  if (/^sup\b/.test(lower)) return "Not much on my side. What's up with you?";

  const hour = now.getHours();
  const part = hour < 12 ? "The morning" : hour < 18 ? "The afternoon" : "The evening";
  return `Hey${name ? `, ${name}` : ""}. ${part} is off to a quiet start on my side. What's on your mind?`;
}

function isHowAreYou(lower: string) {
  return /\bhow are you\b|\bhow(?:'s| is) it going\b|\bhow are things\b|\bhow(?:'s| is| was) your day\b|\bhow have you been\b|\bwhat'?s up\b|\bwassup\b|\bwhat'?s new\b/.test(
    lower,
  );
}

function howAreYouReply(lower: string, history: History) {
  if (/\bwhat'?s up\b|\bwassup\b|\bwhat'?s new\b/.test(lower)) {
    return pick(
      [
        "Not much on my side. What's up with you?",
        "Just waiting for a good conversation. What's new?",
      ],
      history.turnCount,
    );
  }
  const variants = [
    "Doing well, thanks for asking. I like a good conversation. How about you?",
    "Running smoothly, and glad you asked. More importantly, how are you doing?",
    "Pretty good on my side. What's been going on with you?",
  ];
  return pick(variants, history.turnCount);
}

function isThanks(lower: string) {
  return /^(?:thanks|thank you|thx|ty|cheers|appreciate it)\b/.test(lower);
}

function thanksReply(history: History) {
  return pick(
    ["Anytime. Glad it was useful.", "You're welcome. What's next?", "Happy to help."],
    history.turnCount,
  );
}

function isBye(lower: string) {
  return /^(?:bye|goodbye|see you|see ya|good night|goodnight|talk later|gtg)\b/.test(lower);
}

function byeReply() {
  return "Take care. I'll be here when you want to pick this back up.";
}

function isApology(lower: string) {
  return /^(?:sorry|my bad|apologies|i apologize)\b/.test(lower);
}

function isCompliment(lower: string) {
  return /\byou(?:'re| are) (?:great|awesome|amazing|helpful|smart|funny|kind|the best)\b|\bgood bot\b|\bi like you\b/.test(
    lower,
  );
}

function complimentReply(history: History) {
  return pick(
    ["That's kind of you. Glad I'm good company.", "Thanks. I'll take that as a good sign."],
    history.turnCount,
  );
}

function isCorrection(lower: string) {
  return /\b(?:that'?s (?:wrong|incorrect)|you'?re wrong|you misunderstood|that'?s not what i (?:meant|asked)|you'?re repeating)\b/.test(
    lower,
  );
}

function correctionReply() {
  return "Fair enough. Point me at the part that's off, and I'll correct it instead of repeating myself.";
}

function isInvitation(lower: string) {
  return /^(?:can i (?:ask|tell) you something|can we talk|i need to talk|guess what|i have (?:news|something to tell you)|are you there|you there|hello\?|i'?m back|i am back)\b/.test(
    lower,
  );
}

function invitationReply(lower: string) {
  if (/are you there|you there|hello\?/.test(lower)) return "Right here. What's up?";
  if (/guess what/.test(lower)) return "I'm listening. What happened?";
  if (/i have (?:news|something to tell you)/.test(lower))
    return "Tell me. Good or bad, I'm listening.";
  if (/i'?m back|i am back/.test(lower)) return "Welcome back. What's on your mind?";
  return "Of course. Go ahead.";
}

function isAbilityQuestion(lower: string) {
  return /\bwhat can you do\b|\bwhat are you good at\b|\bhow can you help\b|\bwhat are your (?:abilities|skills|limits)\b|\bwhat can'?t you do\b/.test(
    lower,
  );
}

function abilityReply() {
  return "I can hold a normal conversation, keep notes you ask me to save, do quick arithmetic and dates, sketch simple plans, write beginner programs like sums, factorials, and Fibonacci in common languages, and explain a few everyday ideas. In Coder mode I can detect the language and help with code. I can't browse, see files, or answer arbitrary facts reliably, and I'll tell you when something is outside that.";
}

function helpReply(lower: string) {
  if (/^(?:help|help me|i need help)\s*[.!?]*$/.test(lower)) {
    return "I can help. Tell me what you're trying to do, and what's getting in the way.";
  }
  if (/^(?:can you help me|can you help)\b/.test(lower)) {
    return "Probably. Tell me what's going on and what a good outcome would look like.";
  }
  if (
    /^(?:fix it|fix this|it (?:doesn'?t|does not|won'?t) work|it'?s not working|it broke|this is broken|what'?s wrong)\b/.test(
      lower,
    )
  ) {
    return 'I want to get this right instead of guessing. What is "it", and what happens versus what you expected?';
  }
  return null;
}

function casualReply(lower: string) {
  if (/^what are you (?:doing|up to)\b/.test(lower)) {
    return "Just waiting for a good conversation. What are you up to?";
  }
  if (/^(?:i'?m|i am) (?:fine|good|okay|ok)\b|^(?:not much|nothing much|nothing)$/.test(lower)) {
    return "Good to hear. Anything you want to get into, or are we keeping it light?";
  }
  if (/^(?:i don'?t know|idk|no idea|not sure)\b/.test(lower)) {
    return "That's okay. We can figure it out together. What part feels clearest right now?";
  }
  if (/^(?:never mind|nevermind|forget it)\b/.test(lower)) {
    return "No problem. We can drop it, or pick it up later if you change your mind.";
  }
  if (/\bwhat should we talk about\b|\bwhat can we talk about\b|\bgive me a topic\b/.test(lower)) {
    return "We can go with something light: a strange fact, a joke, a riddle, or the best part of your day. Or bring me something you're trying to figure out.";
  }
  if (/\bmeaning of life\b/.test(lower)) {
    return "The honest answer is that nobody gets a universal one. The useful answer is that meaning tends to come from what you choose to pay attention to. What made you ask?";
  }
  if (/^tell me something\s*[.!?]*$/.test(lower)) {
    return "Give me a direction: a strange fact, a joke, a short story, or a riddle.";
  }
  if (/\bcan you keep a secret\b/.test(lower)) {
    return "Everything in this chat stays in this browser, so yes. What's on your mind?";
  }
  if (/\bdo you like me\b/.test(lower)) {
    return "I like talking with you so far. I don't have feelings, but I am genuinely glad you're here. What's on your mind?";
  }
  return null;
}

function isLightAcknowledgement(lower: string) {
  return /^(?:ok|okay|k|cool|nice|great|sure|alright|got it|i see|makes sense|fair enough|yeah|yep|hmm+|hm+|lol|lmao|haha+)[\s.!]*$/.test(
    lower,
  );
}

function acknowledgementReply(lower: string, history: History) {
  if (/^(?:lol|lmao|haha+)/.test(lower)) return "Glad that landed. What else?";
  if (/^(?:hmm+|hm+)$/.test(lower)) return "Take your time. I'm here.";
  if (/^(?:ok|okay|k|alright)$/.test(lower)) return "Alright. What next?";
  return pick(["Good. Where do you want to take it?", "Got it. What's next?"], history.turnCount);
}

function statementReply(text: string, lower: string, history: History) {
  const positiveEvent =
    /\b(?:good|great|fun|amazing|awesome|nice|lovely|worked|won|passed|finished|promoted)\b/.test(
      lower,
    ) ||
    /\bi (?:just |finally )?(?:got|landed) (?:a |an )?(?:new )?(?:job|promotion|offer|role)\b|\bi (?:just |finally )?(?:finished|passed|won|booked|bought|started|met)\b/.test(
      lower,
    );
  if (positiveEvent && /^(?:i|we|my|today|this)\b/.test(lower)) {
    return "That sounds good. What was the best part?";
  }
  if (
    /\b(?:bad|awful|terrible|hard|annoying|weird|failed|lost|messed up)\b/.test(lower) &&
    /^(?:i|we|my|today|this)\b/.test(lower)
  ) {
    return "That sounds rough. What happened?";
  }
  if (/\bi (?:like|love|enjoy)\b/.test(lower)) return "What do you like most about it?";
  if (/\bi (?:hate|can'?t stand|dislike)\b/.test(lower)) return "What set that off?";
  if (/\bi (?:think|believe)\b/.test(lower)) return "What's behind that view?";
  if (/^(?:i|we|my|today|tonight|yesterday|this (?:morning|afternoon|evening))\b/.test(lower)) {
    return pick(
      [
        "Tell me more. What happened?",
        "How did that go?",
        "I'm following. What's the part that stuck with you?",
      ],
      history.turnCount,
    );
  }
  if (text.length > 30 && !/[?]$/.test(lower)) {
    return pick(
      ["That's interesting. What made you bring it up?", "Tell me more. What's the context?"],
      history.turnCount,
    );
  }
  return null;
}

function fallbackReply(text: string, lower: string, _history: History, seed: number) {
  if (/\b(?:summarize|summarise|summary)\b/.test(lower)) {
    return "Paste the passage you want condensed, and tell me how short you need it. With the text in front of me, I can pull out the key points.";
  }
  if (/^(?:write|draft|compose)\b/.test(lower)) {
    return "I can help shape it, though my local rules are better at structure than full creative writing. Tell me what it is for, who will read it, and how long it should be.";
  }
  if (
    /\?$/.test(text) ||
    /^(?:what|why|how|when|where|who|which|can|could|should|would|is|are|do|does)\b/.test(lower)
  ) {
    return pick(
      [
        "I don't want to invent an answer I can't back up. My local rules are strongest on everyday conversation, simple math, planning, and code. Give me the angle that matters to you and I'll take a real run at it.",
        "That one is outside what I can answer reliably from local rules. If you tell me what you're deciding, fixing, or trying to understand, I can help you work through it.",
        "I can't look that up from here, so I would rather be straight than guess. What's the context around it?",
      ],
      seed,
    );
  }
  if (text.split(/\s+/).length <= 2) {
    return "I'm here. Say a little more and I'll pick it up.";
  }
  return pick(
    [
      "Tell me more. What's the part that stuck with you?",
      "I'm following. What happened next?",
      "That sounds worth unpacking. What's on your mind about it?",
      "I'm listening. What made you bring that up now?",
    ],
    seed,
  );
}

function escapeInline(text: string) {
  return String(text).replace(/([\\`*_{}[\]()#+\-.!|>])/g, "\\$1");
}
