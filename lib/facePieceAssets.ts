// AI-generated face-constructor pieces (Higgsfield, pencil/ink sketch, unisex),
// background-removed to transparent PNGs and hosted on the app's Blob store.
// Placed on the Build canvas as image objects (move / resize / rotate). Start
// with 25 eyes across the emotional spectrum; noses, lips, brows, ears, lashes
// follow the same shape.

export interface FacePiece {
  id: string;
  label: string;
  url: string;
}

const HOST = "https://jz2zdu0bh6nu10tq.public.blob.vercel-storage.com/build-assets";
const EYE = (id: string) => `${HOST}/eyes-v2/${id}.png`;
// noses/lips/brows/ears/lashes each live in their own v1 folder.
const PART = (dir: string) => (id: string) => `${HOST}/${dir}/${id}.png`;
const NOSE = PART("noses-v1");
const LIP = PART("lips-v1");
const BROW = PART("brows-v1");
const EAR = PART("ears-v1");
const LASH = PART("lashes-v1");

export const FACE_PIECE_GROUPS: { label: string; items: FacePiece[] }[] = [
  {
    label: "Eyes",
    items: [
      { id: "eye_calm", label: "Calm", url: EYE("eye_calm") },
      { id: "eye_content", label: "Content", url: EYE("eye_content") },
      { id: "eye_neutral", label: "Neutral", url: EYE("eye_neutral") },
      { id: "eye_joyful", label: "Joyful", url: EYE("eye_joyful") },
      { id: "eye_laughing", label: "Laughing", url: EYE("eye_laughing") },
      { id: "eye_loving", label: "Loving", url: EYE("eye_loving") },
      { id: "eye_hopeful", label: "Hopeful", url: EYE("eye_hopeful") },
      { id: "eye_proud", label: "Proud", url: EYE("eye_proud") },
      { id: "eye_playful", label: "Playful", url: EYE("eye_playful") },
      { id: "eye_determined", label: "Determined", url: EYE("eye_determined") },
      { id: "eye_surprised", label: "Surprised", url: EYE("eye_surprised") },
      { id: "eye_shocked", label: "Shocked", url: EYE("eye_shocked") },
      { id: "eye_confused", label: "Confused", url: EYE("eye_confused") },
      { id: "eye_skeptical", label: "Skeptical", url: EYE("eye_skeptical") },
      { id: "eye_anxious", label: "Anxious", url: EYE("eye_anxious") },
      { id: "eye_fearful", label: "Fearful", url: EYE("eye_fearful") },
      { id: "eye_sad", label: "Sad", url: EYE("eye_sad") },
      { id: "eye_crying", label: "Crying", url: EYE("eye_crying") },
      { id: "eye_annoyed", label: "Annoyed", url: EYE("eye_annoyed") },
      { id: "eye_angry", label: "Angry", url: EYE("eye_angry") },
      { id: "eye_furious", label: "Furious", url: EYE("eye_furious") },
      { id: "eye_disgusted", label: "Disgusted", url: EYE("eye_disgusted") },
      { id: "eye_bored", label: "Bored", url: EYE("eye_bored") },
      { id: "eye_sleepy", label: "Sleepy", url: EYE("eye_sleepy") },
      { id: "eye_exhausted", label: "Exhausted", url: EYE("eye_exhausted") },
    ],
  },
  {
    label: "Noses",
    items: [
      { id: "nose_button", label: "Button", url: NOSE("nose_button") },
      { id: "nose_broad", label: "Broad", url: NOSE("nose_broad") },
      { id: "nose_narrow", label: "Narrow", url: NOSE("nose_narrow") },
      { id: "nose_straight_side", label: "Straight (side)", url: NOSE("nose_straight_side") },
      { id: "nose_aquiline", label: "Aquiline", url: NOSE("nose_aquiline") },
      { id: "nose_upturned", label: "Upturned", url: NOSE("nose_upturned") },
      { id: "nose_long", label: "Long", url: NOSE("nose_long") },
      { id: "nose_bulbous", label: "Bulbous", url: NOSE("nose_bulbous") },
      { id: "nose_snub", label: "Snub", url: NOSE("nose_snub") },
      { id: "nose_pointed", label: "Pointed", url: NOSE("nose_pointed") },
      { id: "nose_roman", label: "Roman", url: NOSE("nose_roman") },
      { id: "nose_soft", label: "Soft", url: NOSE("nose_soft") },
      { id: "nose_wideflat", label: "Wide flat", url: NOSE("nose_wideflat") },
      { id: "nose_delicate", label: "Delicate", url: NOSE("nose_delicate") },
    ],
  },
  {
    label: "Lips",
    items: [
      { id: "lip_smile_soft", label: "Soft smile", url: LIP("lip_smile_soft") },
      { id: "lip_neutral", label: "Neutral", url: LIP("lip_neutral") },
      { id: "lip_laugh", label: "Laughing", url: LIP("lip_laugh") },
      { id: "lip_grin", label: "Grin", url: LIP("lip_grin") },
      { id: "lip_frown", label: "Frown", url: LIP("lip_frown") },
      { id: "lip_kiss", label: "Kiss", url: LIP("lip_kiss") },
      { id: "lip_thin", label: "Pressed thin", url: LIP("lip_thin") },
      { id: "lip_gasp", label: "Gasp", url: LIP("lip_gasp") },
      { id: "lip_smirk", label: "Smirk", url: LIP("lip_smirk") },
      { id: "lip_wail", label: "Wailing", url: LIP("lip_wail") },
      { id: "lip_gritted", label: "Gritted", url: LIP("lip_gritted") },
      { id: "lip_parted", label: "Parted", url: LIP("lip_parted") },
      { id: "lip_tongue", label: "Tongue out", url: LIP("lip_tongue") },
      { id: "lip_bite", label: "Biting lip", url: LIP("lip_bite") },
      { id: "lip_shout", label: "Shouting", url: LIP("lip_shout") },
      { id: "lip_content", label: "Content", url: LIP("lip_content") },
      { id: "lip_pout", label: "Pout", url: LIP("lip_pout") },
      { id: "lip_loving", label: "Loving", url: LIP("lip_loving") },
    ],
  },
  {
    label: "Brows",
    items: [
      { id: "brow_neutral", label: "Neutral", url: BROW("brow_neutral") },
      { id: "brow_raised", label: "Raised", url: BROW("brow_raised") },
      { id: "brow_angry", label: "Angry", url: BROW("brow_angry") },
      { id: "brow_furrowed", label: "Furrowed", url: BROW("brow_furrowed") },
      { id: "brow_worried", label: "Worried", url: BROW("brow_worried") },
      { id: "brow_flat", label: "Flat", url: BROW("brow_flat") },
      { id: "brow_bushy", label: "Bushy", url: BROW("brow_bushy") },
      { id: "brow_thin", label: "Thin", url: BROW("brow_thin") },
      { id: "brow_skeptical", label: "Skeptical", url: BROW("brow_skeptical") },
      { id: "brow_rounded", label: "Rounded", url: BROW("brow_rounded") },
      { id: "brow_angular", label: "Angular", url: BROW("brow_angular") },
      { id: "brow_heavy", label: "Heavy", url: BROW("brow_heavy") },
      { id: "brow_lifted", label: "Lifted", url: BROW("brow_lifted") },
      { id: "brow_bold", label: "Bold", url: BROW("brow_bold") },
      { id: "brow_calm", label: "Calm", url: BROW("brow_calm") },
    ],
  },
  {
    label: "Ears",
    items: [
      { id: "ear_average", label: "Average", url: EAR("ear_average") },
      { id: "ear_small", label: "Small", url: EAR("ear_small") },
      { id: "ear_large", label: "Large", url: EAR("ear_large") },
      { id: "ear_pointed", label: "Pointed", url: EAR("ear_pointed") },
      { id: "ear_rounded", label: "Rounded", url: EAR("ear_rounded") },
      { id: "ear_detailed", label: "Detailed", url: EAR("ear_detailed") },
      { id: "ear_side", label: "Side", url: EAR("ear_side") },
      { id: "ear_broad", label: "Broad", url: EAR("ear_broad") },
      { id: "ear_delicate", label: "Delicate", url: EAR("ear_delicate") },
      { id: "ear_lobe", label: "Full lobe", url: EAR("ear_lobe") },
    ],
  },
  {
    label: "Lashes",
    items: [
      { id: "lash_natural", label: "Natural", url: LASH("lash_natural") },
      { id: "lash_full", label: "Full", url: LASH("lash_full") },
      { id: "lash_dramatic", label: "Dramatic", url: LASH("lash_dramatic") },
      { id: "lash_wispy", label: "Wispy", url: LASH("lash_wispy") },
      { id: "lash_winged", label: "Winged", url: LASH("lash_winged") },
      { id: "lash_short", label: "Short", url: LASH("lash_short") },
      { id: "lash_clustered", label: "Clustered", url: LASH("lash_clustered") },
      { id: "lash_curled", label: "Curled", url: LASH("lash_curled") },
    ],
  },
];
