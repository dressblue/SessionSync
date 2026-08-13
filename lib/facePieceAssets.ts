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

const EYE = (id: string) =>
  `https://jz2zdu0bh6nu10tq.public.blob.vercel-storage.com/build-assets/eyes-v2/${id}.png`;

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
];
