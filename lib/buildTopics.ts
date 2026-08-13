// "Build" tool topics. Each topic seeds a themed bucket of emoji "pieces"
// (grouped exactly like the whiteboard's STAMP_GROUPS so it drops straight into
// the Whiteboard component's `stampGroups` prop) plus a build prompt. Basic
// shapes / colors / text / pen are always available in the canvas itself.

export interface BuildTopic {
  key: string;
  label: string;
  prompt: string;
  stampGroups: { label: string; items: string[] }[];
}

export const BUILD_TOPICS: BuildTopic[] = [
  {
    key: "house",
    label: "House / home",
    prompt: "Build a home that matters to you — a place you lived, or one you wish for.",
    stampGroups: [
      { label: "Structure", items: ["🏠", "🏡", "🏚️", "🏘️", "🏢", "🛖", "⛺", "🏰", "🚪", "🪟", "🧱", "🪜", "🛗"] },
      { label: "Inside", items: ["🛋️", "🪑", "🛏️", "🚽", "🛁", "🚿", "🪞", "🖼️", "🕯️", "🪴", "📺", "☎️", "🧸", "📚"] },
      { label: "Around it", items: ["🌳", "🌲", "🌷", "🌻", "🚗", "🐕", "🐈", "🔥", "☀️", "🌙", "⛅", "🏞️", "🚧", "🔑"] },
      { label: "People", items: ["🙂", "👩", "👨", "🧒", "👶", "👵", "👴", "👨‍👩‍👧", "🤝", "❤️", "💔"] },
    ],
  },
  {
    key: "car",
    label: "Car / vehicle",
    prompt: "Build a car or vehicle that means something to you.",
    stampGroups: [
      { label: "Vehicles", items: ["🚗", "🚙", "🏎️", "🚕", "🚐", "🚚", "🛻", "🏍️", "🛵", "🚲", "🚓", "🚑", "🚌", "🚜"] },
      { label: "Parts", items: ["🛞", "🪟", "💺", "⛽", "🔧", "🔩", "🧰", "🔋", "🚨", "📻"] },
      { label: "Journey", items: ["🛣️", "🚦", "🛑", "🅿️", "⛰️", "🌉", "🏁", "🗺️", "🧭", "☀️", "🌧️", "🌙"] },
      { label: "Feeling", items: ["😀", "😎", "😱", "❤️", "💨", "⭐", "🔥"] },
    ],
  },
  {
    key: "bridge",
    label: "Bridge",
    prompt: "Build a bridge — between where you were and where you want to be.",
    stampGroups: [
      { label: "Bridge", items: ["🌉", "🌁", "🧱", "🪵", "🔗", "⛓️", "🪢", "🛤️", "🚧"] },
      { label: "Below & beyond", items: ["🌊", "🌫️", "⛰️", "🏔️", "🏞️", "🔥", "🕳️", "🏝️", "🏙️", "🏁", "🎯"] },
      { label: "Crossing", items: ["🚶", "🏃", "🧗", "🚴", "🕊️", "🧍", "🤝", "👣"] },
      { label: "Feeling", items: ["❤️", "😌", "😰", "💪", "⭐", "🌈", "☀️"] },
    ],
  },
  {
    key: "mask",
    label: "Emotional mask (inside / outside)",
    prompt: "Build your mask: the face you show the world on the outside, and what's underneath on the inside.",
    stampGroups: [
      { label: "Masks", items: ["🎭", "🪞", "🫥", "👤", "🥸", "🤡"] },
      { label: "Outside face", items: ["🙂", "😀", "😎", "😐", "😅", "🤗", "😇", "🙃", "💪", "👍"] },
      { label: "Inside truth", items: ["😢", "😭", "😡", "😨", "😱", "😔", "😞", "🥀", "💔", "🕳️", "🌧️", "❤️‍🩹"] },
      { label: "Symbols", items: ["❤️", "🔥", "⚡", "🧊", "🌈", "⭐", "🔒", "🔓"] },
    ],
  },
  {
    key: "lifemap",
    label: "Life map",
    prompt: "Build a map of your life so far — the roads, milestones, and turning points.",
    stampGroups: [
      { label: "Path", items: ["🛣️", "🗺️", "🧭", "🚩", "📍", "🏁", "🔀", "⛰️", "🌉", "🚧", "🛑"] },
      { label: "Milestones", items: ["👶", "🎓", "💍", "🏠", "💼", "🍼", "🏥", "✈️", "🎉", "🏆", "⚰️", "🐣"] },
      { label: "Seasons", items: ["🌅", "🌄", "🌃", "☀️", "🌧️", "⛈️", "❄️", "🌈", "🌊", "🔥"] },
      { label: "Feeling", items: ["❤️", "💔", "😀", "😢", "⭐", "🕯️", "🌱"] },
    ],
  },
  {
    key: "emotiontree",
    label: "Emotion tree",
    prompt: "Build a tree of your emotions — roots, trunk, branches, what's growing and what's falling.",
    stampGroups: [
      { label: "Tree", items: ["🌳", "🌲", "🌴", "🎄", "🪵", "🌱", "🌿", "🍃", "🍂", "🪹"] },
      { label: "Growth", items: ["🌸", "🌷", "🌻", "🍎", "🍏", "🍊", "🫐", "🌰", "🍄", "🐝", "🦋", "🐦"] },
      { label: "Weather", items: ["☀️", "🌧️", "⛈️", "🌈", "💨", "❄️", "🔥", "💧"] },
      { label: "Feeling", items: ["❤️", "💚", "😌", "😢", "😡", "⭐", "💔", "🕊️"] },
    ],
  },
  {
    key: "innerchild",
    label: "Inner-child portrait",
    prompt: "Build a picture of your inner child — what they loved, needed, and played with.",
    stampGroups: [
      { label: "Play", items: ["🧸", "🎈", "🪀", "🚲", "🛝", "🪁", "⚽", "🏀", "🎨", "🖍️", "🎠", "🎡"] },
      { label: "Comfort", items: ["🍭", "🍦", "🍪", "🐶", "🐱", "🌈", "⭐", "☀️", "🛏️", "🫂", "❤️"] },
      { label: "Home", items: ["🏠", "👩", "👨", "👵", "👴", "🧒", "👶", "🎂", "📺", "🪟"] },
      { label: "Feeling", items: ["😀", "😢", "😨", "🥹", "😴", "💔", "🕯️"] },
    ],
  },
  {
    key: "visionboard",
    label: "Vision board",
    prompt: "Build a vision board — the life, goals, and feelings you're reaching toward.",
    stampGroups: [
      { label: "Goals", items: ["⭐", "🎯", "🏆", "🥇", "🚀", "📈", "💡", "🎓", "💼", "📚", "✍️", "🧗"] },
      { label: "Life", items: ["🏡", "✈️", "🏝️", "🚗", "💍", "👶", "🐕", "💰", "🌅", "🏔️", "🎨", "🎸"] },
      { label: "Wellbeing", items: ["❤️", "🧘", "💪", "🥗", "😴", "🕊️", "🌱", "☀️", "🙏", "🌈"] },
      { label: "Connection", items: ["🤝", "🫂", "👨‍👩‍👧", "💌", "🎉", "🌍"] },
    ],
  },
  {
    key: "selfportrait",
    label: "Self-portrait",
    prompt: "Build a self-portrait — how you see yourself, inside and out.",
    stampGroups: [
      { label: "Faces", items: ["🙂", "😀", "😎", "😐", "😢", "😡", "😌", "🥹", "🤔", "😴", "👤", "🪞"] },
      { label: "Features", items: ["👓", "🕶️", "🧢", "👒", "🧣", "💇", "🧔", "💄", "👂", "👀", "👃", "🦷"] },
      { label: "What I carry", items: ["❤️", "🔥", "🧊", "🌈", "⭐", "⚡", "🌱", "🎭", "🎨", "🎸", "📚", "💪"] },
    ],
  },
  {
    key: "safeplace",
    label: "Safe place",
    prompt: "Build a place where you feel completely safe and at peace.",
    stampGroups: [
      { label: "Place", items: ["🏡", "🛖", "⛺", "🏝️", "🏞️", "🌲", "🏔️", "🕌", "⛪", "🚪", "🪟"] },
      { label: "Comfort", items: ["🛏️", "🔥", "🕯️", "🛋️", "☕", "🍵", "📚", "🎧", "🧸", "🪴", "🛁"] },
      { label: "Around", items: ["🐕", "🐈", "🌙", "⭐", "☀️", "🌊", "🌧️", "🕊️", "🌈", "🦋"] },
      { label: "Feeling", items: ["❤️", "😌", "🙏", "🫂", "🤍"] },
    ],
  },
  {
    key: "family",
    label: "Family sculpture",
    prompt: "Build a sculpture of your family — who's close, who's distant, how it feels.",
    stampGroups: [
      { label: "People", items: ["👩", "👨", "🧒", "👧", "👦", "👶", "👵", "👴", "🧑", "🤰", "👨‍👩‍👧‍👦", "🧑‍🦽"] },
      { label: "Bonds", items: ["❤️", "💔", "🤝", "🫂", "⛓️", "🔗", "🧵", "🚧", "🧱", "↔️"] },
      { label: "Home & pets", items: ["🏠", "🐕", "🐈", "🐠", "🪴", "🕯️", "🎂", "📸"] },
      { label: "Weather", items: ["☀️", "🌧️", "⛈️", "🌈", "🔥", "🧊", "🌙"] },
    ],
  },
  {
    key: "freeform",
    label: "Freeform (all pieces)",
    prompt: "Build whatever represents your person, place, thing, or event.",
    stampGroups: [
      { label: "People", items: ["🙂", "😀", "🧍", "👥", "👨‍👩‍👧", "🧑‍🏫", "👶", "🧑‍🍳", "🕺"] },
      { label: "Buildings", items: ["🏠", "🏡", "🏢", "🏫", "🏥", "⛪", "🏭", "🏛️", "🚪", "🪑"] },
      { label: "Nature", items: ["🌳", "🌲", "🌱", "🌸", "🌊", "⛰️", "🔥", "💧", "❄️", "🍂"] },
      { label: "Weather", items: ["☀️", "⛅", "☁️", "🌧️", "⛈️", "🌈", "⭐", "🌙"] },
      { label: "Transport", items: ["🚗", "🚌", "🚲", "✈️", "🚀", "⛵", "🚂", "🛣️"] },
      { label: "Animals", items: ["🐶", "🐱", "🐴", "🐟", "🦋", "🐢", "🦉", "🐰"] },
      { label: "Objects", items: ["💻", "📱", "📷", "✉️", "🔑", "🔒", "💡", "🎁", "💰", "📚", "🏆"] },
      { label: "Symbols", items: ["❤️", "⭐", "✅", "❌", "⚠️", "🚩", "🎯", "💬", "🔴", "🟢"] },
      { label: "Food", items: ["🍎", "🍞", "🍕", "☕", "🍰", "🥗", "🍌", "🥕"] },
    ],
  },
];

export function buildTopic(key: string | undefined): BuildTopic {
  return BUILD_TOPICS.find((t) => t.key === key) ?? BUILD_TOPICS[BUILD_TOPICS.length - 1];
}
