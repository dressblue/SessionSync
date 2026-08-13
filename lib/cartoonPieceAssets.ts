// Second "Cartoon kit" — bold flat comic-style versions of every Face-kit
// category (+ adornments), hosted on the app's Blob store as transparent PNGs.
// Same shape as FACE_PIECE_GROUPS so the Whiteboard picker can reuse the UI.
import type { FacePiece } from "./facePieceAssets";

const HOST = "https://jz2zdu0bh6nu10tq.public.blob.vercel-storage.com/build-assets";
const P = (dir: string) => (id: string) => `${HOST}/${dir}/${id}.png`;
const CFACE = P("cartoon-faces-v1");
const CEYE = P("cartoon-eyes-v1");
const CBROW = P("cartoon-brows-v1");
const CNOSE = P("cartoon-noses-v1");
const CLIP = P("cartoon-lips-v1");
const CEAR = P("cartoon-ears-v1");
const CLASH = P("cartoon-lashes-v1");
const CHAIR = P("cartoon-hair-v1");
const CGL = P("cartoon-glasses-v1");
const CSUN = P("cartoon-sunglasses-v1");
const CMASK = P("cartoon-masks-v1");
const CERNG = P("cartoon-earrings-v1");
const CHAT = P("cartoon-hats-v1");
const CSCARF = P("cartoon-scarves-v1");

const mk = (fn: (id: string) => string, pairs: [string, string][]): FacePiece[] =>
  pairs.map(([id, label]) => ({ id, label, url: fn(id) }));

export const CARTOON_PIECE_GROUPS: { label: string; items: FacePiece[] }[] = [
  {
    label: "Face shapes",
    items: mk(CFACE, [
      ["cface_oval", "Oval"], ["cface_round", "Round"], ["cface_square", "Square"],
      ["cface_heart", "Heart"], ["cface_oblong", "Oblong"], ["cface_diamond", "Diamond"],
      ["cface_triangle", "Triangle"], ["cface_inverted", "Inverted"], ["cface_rectangle", "Rectangle"],
      ["cface_pear", "Pear"], ["cface_wide", "Wide"], ["cface_egg", "Egg"],
    ]),
  },
  {
    label: "Eyes",
    items: mk(CEYE, [
      ["ceye_happy", "Happy"], ["ceye_neutral", "Neutral"], ["ceye_sad", "Sad"],
      ["ceye_angry", "Angry"], ["ceye_surprised", "Surprised"], ["ceye_wink", "Wink"],
      ["ceye_love", "Love"], ["ceye_sleepy", "Sleepy"], ["ceye_crying", "Crying"],
      ["ceye_scared", "Scared"], ["ceye_laughing", "Laughing"], ["ceye_suspicious", "Suspicious"],
      ["ceye_excited", "Excited"], ["ceye_bored", "Bored"], ["ceye_confused", "Confused"],
      ["ceye_mischievous", "Mischievous"], ["ceye_shocked", "Shocked"], ["ceye_content", "Content"],
      ["ceye_dizzy", "Dizzy"], ["ceye_glaring", "Glaring"], ["ceye_pleading", "Pleading"],
      ["ceye_annoyed", "Annoyed"], ["ceye_proud", "Proud"], ["ceye_timid", "Timid"],
    ]),
  },
  {
    label: "Brows",
    items: mk(CBROW, [
      ["cbrow_neutral", "Neutral"], ["cbrow_raised", "Raised"], ["cbrow_angry", "Angry"],
      ["cbrow_sad", "Sad"], ["cbrow_worried", "Worried"], ["cbrow_flat", "Flat"],
      ["cbrow_bushy", "Bushy"], ["cbrow_thin", "Thin"], ["cbrow_skeptical", "Skeptical"],
      ["cbrow_rounded", "Rounded"], ["cbrow_angular", "Angular"], ["cbrow_wavy", "Wavy"],
      ["cbrow_short", "Short"], ["cbrow_arched", "Arched"],
    ]),
  },
  {
    label: "Noses",
    items: mk(CNOSE, [
      ["cnose_button", "Button"], ["cnose_bulbous", "Bulbous"], ["cnose_big", "Big"],
      ["cnose_tiny", "Tiny"], ["cnose_pointy", "Pointy"], ["cnose_upturned", "Upturned"],
      ["cnose_long", "Long"], ["cnose_triangle", "Triangle"], ["cnose_wideflat", "Wide flat"],
      ["cnose_hooked", "Hooked"], ["cnose_wide", "Wide"], ["cnose_dots", "Two-dot"],
    ]),
  },
  {
    label: "Lips",
    items: mk(CLIP, [
      ["clip_smile", "Smile"], ["clip_grin", "Grin"], ["clip_neutral", "Neutral"],
      ["clip_sad", "Sad"], ["clip_laugh", "Laughing"], ["clip_o", "Surprised O"],
      ["clip_kiss", "Kiss"], ["clip_tongue", "Tongue out"], ["clip_snarl", "Snarl"],
      ["clip_smirk", "Smirk"], ["clip_shout", "Shout"], ["clip_small", "Small"],
      ["clip_buckteeth", "Buck teeth"], ["clip_pout", "Pout"], ["clip_gasp", "Gasp"],
      ["clip_crying", "Crying"], ["clip_content", "Content"], ["clip_disgust", "Disgust"],
      ["clip_whistle", "Whistle"], ["clip_fangs", "Fangs"], ["clip_nervous", "Nervous"],
      ["clip_toothy", "Toothy laugh"], ["clip_gritted", "Gritted"], ["clip_yawn", "Yawn"],
    ]),
  },
  {
    label: "Ears",
    items: mk(CEAR, [
      ["cear_normal", "Normal"], ["cear_big", "Big"], ["cear_small", "Small"],
      ["cear_elf", "Elf"], ["cear_round", "Round"], ["cear_detailed", "Detailed"],
      ["cear_lobe", "Big lobe"], ["cear_angle", "Angled"],
    ]),
  },
  {
    label: "Lashes",
    items: mk(CLASH, [
      ["clash_natural", "Natural"], ["clash_long", "Long"], ["clash_short", "Short"],
      ["clash_winged", "Winged"], ["clash_curled", "Curled"], ["clash_spiky", "Spiky"],
    ]),
  },
  {
    label: "Hair",
    items: mk(CHAIR, [
      ["chair_spiky", "Spiky"], ["chair_buzz", "Buzz"], ["chair_bowl", "Bowl"],
      ["chair_afro", "Afro"], ["chair_long_straight", "Long straight"], ["chair_long_wavy", "Long wavy"],
      ["chair_ponytail", "Ponytail"], ["chair_pigtails", "Pigtails"], ["chair_bun", "Messy bun"],
      ["chair_bob", "Bob"], ["chair_mohawk", "Mohawk"], ["chair_bald", "Bald + sides"],
      ["chair_sidepart", "Side part"], ["chair_manbun", "Man bun"], ["chair_dreads", "Dreadlocks"],
      ["chair_braids", "Braids"], ["chair_pixie", "Pixie"], ["chair_anime", "Spiky anime"],
      ["chair_bangs", "Bangs"], ["chair_curly", "Curly"], ["chair_cornrows", "Cornrows"],
      ["chair_beehive", "Beehive"], ["chair_messy", "Messy"], ["chair_curtain", "Curtains"],
    ]),
  },
  {
    label: "Glasses",
    items: mk(CGL, [
      ["cglasses_round", "Round"], ["cglasses_rect", "Rectangle"], ["cglasses_cateye", "Cat-eye"],
      ["cglasses_nerd", "Big nerd"], ["cglasses_oval", "Oval"], ["cglasses_star", "Star"],
      ["cglasses_heart", "Heart"], ["cglasses_hipster", "Hipster"], ["cglasses_aviator", "Aviator"],
      ["cglasses_halfmoon", "Half-moon"], ["cglasses_tiny", "Tiny round"], ["cglasses_hexagon", "Hexagon"],
    ]),
  },
  {
    label: "Sunglasses",
    items: mk(CSUN, [
      ["csun_aviator", "Aviator"], ["csun_wayfarer", "Wayfarer"], ["csun_round", "Round"],
      ["csun_cateye", "Cat-eye"], ["csun_star", "Star"], ["csun_heart", "Heart"],
      ["csun_big", "Big square"], ["csun_wrap", "Wrap"], ["csun_clubmaster", "Clubmaster"],
      ["csun_shield", "Shield"], ["csun_tiny", "Tiny"], ["csun_goggles", "Goggles"],
    ]),
  },
  {
    label: "Masks",
    items: mk(CMASK, [
      ["cmask_surgical", "Surgical"], ["cmask_n95", "N95"], ["cmask_cloth", "Cloth"],
      ["cmask_domino", "Domino"], ["cmask_zorro", "Zorro"], ["cmask_balaclava", "Balaclava"],
      ["cmask_bandana", "Outlaw bandana"], ["cmask_superhero", "Superhero"], ["cmask_skull", "Skull"],
      ["cmask_gas", "Gas mask"], ["cmask_ninja", "Ninja"], ["cmask_masquerade", "Masquerade"],
    ]),
  },
  {
    label: "Earrings",
    items: mk(CERNG, [
      ["cearring_hoop", "Hoop"], ["cearring_stud", "Stud"], ["cearring_star", "Star"],
      ["cearring_heart", "Heart"], ["cearring_drop", "Drop"], ["cearring_cross", "Cross"],
      ["cearring_gem", "Gem"], ["cearring_bolt", "Lightning"],
    ]),
  },
  {
    label: "Hats",
    items: mk(CHAT, [
      ["chat_baseball", "Baseball cap"], ["chat_beanie", "Beanie"], ["chat_tophat", "Top hat"],
      ["chat_cowboy", "Cowboy"], ["chat_party", "Party cone"], ["chat_wizard", "Wizard"],
      ["chat_crown", "Crown"], ["chat_chef", "Chef"], ["chat_pirate", "Pirate"],
      ["chat_propeller", "Propeller"], ["chat_fedora", "Fedora"], ["chat_grad", "Graduation"],
    ]),
  },
  {
    label: "Scarves",
    items: mk(CSCARF, [
      ["cscarf_wrapped", "Wrapped"], ["cscarf_long", "Long"], ["cscarf_knit", "Chunky knit"],
      ["cscarf_infinity", "Infinity"], ["cscarf_plaid", "Plaid"], ["cscarf_bandana", "Bandana"],
    ]),
  },
];
