// AI-generated face-constructor pieces (Higgsfield, pencil/ink sketch, unisex),
// hosted as transparent PNGs on the app's Blob store. Placed on the Build canvas
// as image objects (move / resize / rotate). Start with 25 eyes across the
// emotional spectrum; noses, lips, brows, ears, lashes follow the same shape.

export interface FacePiece {
  id: string;
  label: string;
  url: string;
}

export const FACE_PIECE_GROUPS: { label: string; items: FacePiece[] }[] = [
  {
    label: "Eyes",
    items: [
      { id: "eye_calm", label: "Calm", url: "https://jz2zdu0bh6nu10tq.public.blob.vercel-storage.com/build-assets/eyes/eye_calm-xP52BeYrpmn6SFNtrCk7uY6iC3MqZW.png" },
      { id: "eye_content", label: "Content", url: "https://jz2zdu0bh6nu10tq.public.blob.vercel-storage.com/build-assets/eyes/eye_content-o2ibRSu05UjJLjTJdgAOmGrQtHTQFO.png" },
      { id: "eye_neutral", label: "Neutral", url: "https://jz2zdu0bh6nu10tq.public.blob.vercel-storage.com/build-assets/eyes/eye_neutral-EHQnOoPkQe0gd0bBkUb8kZELJW1Lm4.png" },
      { id: "eye_joyful", label: "Joyful", url: "https://jz2zdu0bh6nu10tq.public.blob.vercel-storage.com/build-assets/eyes/eye_joyful-A2AImpewSPBfZBuiEBvyNpFtK3Szu0.png" },
      { id: "eye_laughing", label: "Laughing", url: "https://jz2zdu0bh6nu10tq.public.blob.vercel-storage.com/build-assets/eyes/eye_laughing-GEQvZitOD4VZsvRCRxmlCkxMYVFcu2.png" },
      { id: "eye_loving", label: "Loving", url: "https://jz2zdu0bh6nu10tq.public.blob.vercel-storage.com/build-assets/eyes/eye_loving-hfbnZD0I05tC4o8BtYn0k2nZlc1Wyn.png" },
      { id: "eye_hopeful", label: "Hopeful", url: "https://jz2zdu0bh6nu10tq.public.blob.vercel-storage.com/build-assets/eyes/eye_hopeful-0A7CQxVxsfSMvoaaKCsQcGuTizP8RF.png" },
      { id: "eye_proud", label: "Proud", url: "https://jz2zdu0bh6nu10tq.public.blob.vercel-storage.com/build-assets/eyes/eye_proud-AXsp6vAWxlpEOAFVpFEpaGaxjzyZ3p.png" },
      { id: "eye_playful", label: "Playful", url: "https://jz2zdu0bh6nu10tq.public.blob.vercel-storage.com/build-assets/eyes/eye_playful-6kiJy1XgmkRpmSCgVUfabvleglr7Lc.png" },
      { id: "eye_determined", label: "Determined", url: "https://jz2zdu0bh6nu10tq.public.blob.vercel-storage.com/build-assets/eyes/eye_determined-YrLzfGeF9Dcu0urbBcKmDCk9uBxb1b.png" },
      { id: "eye_surprised", label: "Surprised", url: "https://jz2zdu0bh6nu10tq.public.blob.vercel-storage.com/build-assets/eyes/eye_surprised-eneNjtOVtJNCdCyVqEMVMZxzdbKYwC.png" },
      { id: "eye_shocked", label: "Shocked", url: "https://jz2zdu0bh6nu10tq.public.blob.vercel-storage.com/build-assets/eyes/eye_shocked-t7zVLpj6cWkh6LcXN1vSpGvF0NivZu.png" },
      { id: "eye_confused", label: "Confused", url: "https://jz2zdu0bh6nu10tq.public.blob.vercel-storage.com/build-assets/eyes/eye_confused-pj4rPjuQveBQTPt12QI89RtqTCOjFe.png" },
      { id: "eye_skeptical", label: "Skeptical", url: "https://jz2zdu0bh6nu10tq.public.blob.vercel-storage.com/build-assets/eyes/eye_skeptical-9qiS1nz2Kpb5WTFOQlTmLrR9PRUphK.png" },
      { id: "eye_anxious", label: "Anxious", url: "https://jz2zdu0bh6nu10tq.public.blob.vercel-storage.com/build-assets/eyes/eye_anxious-sVTQVZACCaVYdICnMyxvp2LqLRaxeU.png" },
      { id: "eye_fearful", label: "Fearful", url: "https://jz2zdu0bh6nu10tq.public.blob.vercel-storage.com/build-assets/eyes/eye_fearful-a7HOAGXpyfDAlKjfO4VsJURjqNkQNI.png" },
      { id: "eye_sad", label: "Sad", url: "https://jz2zdu0bh6nu10tq.public.blob.vercel-storage.com/build-assets/eyes/eye_sad-Tw6BlgZuhswrJIn3L2WVkjz9xMixpe.png" },
      { id: "eye_crying", label: "Crying", url: "https://jz2zdu0bh6nu10tq.public.blob.vercel-storage.com/build-assets/eyes/eye_crying-Of9RAnvybJFEmh1sl58yAnPAAxoRLE.png" },
      { id: "eye_annoyed", label: "Annoyed", url: "https://jz2zdu0bh6nu10tq.public.blob.vercel-storage.com/build-assets/eyes/eye_annoyed-ENMOoF5w7CfAyOL6NYbw7pvU3myPtO.png" },
      { id: "eye_angry", label: "Angry", url: "https://jz2zdu0bh6nu10tq.public.blob.vercel-storage.com/build-assets/eyes/eye_angry-e4W5OAKCcRDdwojuvtMR9rfo4AXvAg.png" },
      { id: "eye_furious", label: "Furious", url: "https://jz2zdu0bh6nu10tq.public.blob.vercel-storage.com/build-assets/eyes/eye_furious-IvWcsDI56Ez2za7mOGVUxRYrH8XlCH.png" },
      { id: "eye_disgusted", label: "Disgusted", url: "https://jz2zdu0bh6nu10tq.public.blob.vercel-storage.com/build-assets/eyes/eye_disgusted-gRSHKguM4Xtw7YjOvYyeoFsJvmkryB.png" },
      { id: "eye_bored", label: "Bored", url: "https://jz2zdu0bh6nu10tq.public.blob.vercel-storage.com/build-assets/eyes/eye_bored-L4KaGDRdapwwdXTudhlGynf4Hbaaag.png" },
      { id: "eye_sleepy", label: "Sleepy", url: "https://jz2zdu0bh6nu10tq.public.blob.vercel-storage.com/build-assets/eyes/eye_sleepy-zqXCqgcmRn5WUv3NdMx0QfQram2juX.png" },
      { id: "eye_exhausted", label: "Exhausted", url: "https://jz2zdu0bh6nu10tq.public.blob.vercel-storage.com/build-assets/eyes/eye_exhausted-LGIMMmT181e4LHPHxVqBCjZwEGnptX.png" },
    ],
  },
];
