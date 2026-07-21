// Seeds the 24:7 Dad A.M. course as a facilitation companion.
//
// Content model: this seeds run-of-show structure and facilitator guidance
// keyed to slide numbers in the licensed NFI deck (24-7-Dad-AM_PPT.pptx).
// The deck itself stays the presentation medium (screen-shared in Zoom);
// no slide text is reproduced here beyond titles/topic names.
//
// Usage: node scripts/seed-247dad.mjs [baseUrl]
//   Prints the course code — join it from any facilitator identity.

const BASE = process.argv[2] ?? "http://localhost:3000";

async function api(path, method, body, headers = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${data?.error ?? "?"}`);
  }
  return data;
}

const closing = (workbookNote) =>
  `## Wrap-up\n\n- Recap the session's key ideas in the group's own words.\n- ${workbookNote}\n- Ask each dad for one commitment to practice before the next session.\n- Remind the group of the next session's date/time and thank them for showing up.`;

const reviewStep = (q1, q2) =>
  `## Run the review\n\nRun both review questions as **Vote activities** (Push an activity → Vote) so every dad answers on his own screen:\n\n1. ${q1}\n2. ${q2}\n\nAfter each vote closes, reveal the deck's answer on the slide and let the group react before moving on.`;

const SESSIONS = [
  {
    title: "Session 1: The 5 Traits of the 24:7 Dad",
    steps: [
      {
        t: "Welcome & program overview",
        c: "## Welcome (slide 1)\n\n- Welcome the group to the 24:7 Dad A.M. program — 12 weekly sessions.\n- Introductions: name, children's names/ages, one hope for the program.\n- Set group agreements (confidentiality, one voice at a time, phones down, honesty).\n- Preview today's focus: the framework the whole program hangs on.",
      },
      {
        t: "The 5 Traits framework",
        c: "## The 5 Traits (slides 2–3)\n\nWalk the trait wheel — the five areas the program builds:\n\n1. **Self-Awareness**\n2. **Caring for Self**\n3. **Relationship Skills**\n4. **Parenting Skills**\n5. **Fathering Skills**\n\n**Discussion:** which trait feels strongest for you today? Which one brought you here?",
      },
      {
        t: "Review questions",
        c: reviewStep(
          "Naming the 5 traits (slide 4, options a–d).",
          "How the 24:7 Dad uses self-awareness with his children (slide 5, options a–f)."
        ),
      },
      {
        t: "Wrap-up & take-home",
        c: closing("Point the group to the matching Fathering Handbook pages for Session 1."),
      },
    ],
  },
  {
    title: "Session 2: What It Means to Be a Man",
    steps: [
      {
        t: "Welcome & check-in",
        c: "## Welcome back (slide 6)\n\n- Check-in: how did last week's commitment go?\n- Preview: where our ideas about \"being a man\" come from — and what they do to us.",
      },
      {
        t: "Cross-cultural traits of a man",
        c: "## Traits of a man (slide 7)\n\nThe deck lists traits many cultures attach to manhood (self-confidence, courage, leadership, dependability, and also *controlling*).\n\n**Discussion:** which of these did the men in your life model? Which serve you as a father, and which get in the way?",
      },
      {
        t: "Body image",
        c: "## Body image (slide 8)\n\nCulture sends unrealistic images of what men should look like.\n\n**Discussion:** where do those messages show up (media, gym culture, childhood)? How do they land on our sons and daughters?",
      },
      {
        t: "Review questions",
        c: reviewStep(
          "Whether today's culture links body image to being a man (slide 9, true/false).",
          "Which source teaches most about what it means to be a man (slide 10, options a–e)."
        ),
      },
      {
        t: "Wrap-up & take-home",
        c: closing("Handbook pages for Session 2; notice one 'man message' in the media this week."),
      },
    ],
  },
  {
    title: "Session 3: Showing and Handling Feelings",
    steps: [
      {
        t: "Welcome & check-in",
        c: "## Welcome back (slide 11)\n\n- Check-in on the week.\n- Preview: feelings — showing them, handling them, and what happens when we don't.",
      },
      {
        t: "Showing and handling feelings",
        c: "## Feelings (slide 12)\n\nKey ideas from the deck: bottled-up feelings cause problems in body and mind; there are moments when holding a feeling is okay; what matters is *how* you show and handle them.\n\n**Discussion:** what did your father do with his feelings? What do your children see you do?",
      },
      {
        t: "Grief and loss",
        c: "## Grief and loss (slide 13)\n\nUngrieved losses follow us into health and relationships; crying is a primary human tool for grieving — and many boys are taught out of it.\n\n**Discussion:** a loss you've carried (invite, don't require, sharing).",
      },
      {
        t: "Review questions",
        c: reviewStep(
          "Good ways for men to handle feelings (slide 14, options a–f).",
          "What best defines grieving (slide 15, options a–f)."
        ),
      },
      {
        t: "Wrap-up & take-home",
        c: closing("Handbook pages for Session 3."),
      },
    ],
  },
  {
    title: "Session 4: Stress, Anger, and Men's Health",
    steps: [
      {
        t: "Welcome & check-in",
        c: "## Welcome back (slide 16)\n\n- Check-in.\n- Preview: what stress and anger do to a man's health — and healthier ways through.",
      },
      {
        t: "Stress and anger",
        c: "## Stress & anger (slides 17–18)\n\nMental and physical health feed each other; anger is energy — it's how the energy shows itself that causes trouble. Men often ignore warning signs until it's late.\n\n**Discussion:** your body's early warning signs; what you do when the pressure spikes.",
      },
      {
        t: "Review questions",
        c: reviewStep(
          "Which ways of handling stress are *not* healthy (slide 19, options a–g).",
          "Why most men avoid the doctor (slide 20, options a–e)."
        ),
      },
      {
        t: "Wrap-up & take-home",
        c: closing("Handbook pages for Session 4; consider one overdue health action (checkup, sleep, movement)."),
      },
    ],
  },
  {
    title: "Session 5: Communication",
    steps: [
      {
        t: "Welcome & check-in",
        c: "## Welcome back (slide 21)\n\n- Check-in.\n- Preview: communication styles, and how to talk *with* (not at) your children.",
      },
      {
        t: "Ways to communicate",
        c: "## Communication styles (slide 22)\n\nThe 24:7 Dad owns his side of communication problems. Review the styles named in the deck (fight-or-flight, defensive/closed, good listener, open to change).\n\n**Discussion:** which style is your default under stress?",
      },
      {
        t: "Talking with children",
        c: "## Talking with children (slide 23)\n\nDeck principles: honor what your children want, send good messages to yourself, avoid bad labels, focus on the goal and on what children learn.\n\n**Practice:** pair up and rehearse one upcoming conversation with a child.",
      },
      {
        t: "Review questions",
        c: reviewStep(
          "Which item is *not* a communication style (slide 24, options a–f).",
          "The best approach when talking with children (slide 25, options a–e)."
        ),
      },
      {
        t: "Wrap-up & take-home",
        c: closing("Handbook pages for Session 5; try one 'good listener' conversation this week."),
      },
    ],
  },
  {
    title: "Session 6: The Father's Role",
    steps: [
      {
        t: "Welcome & check-in",
        c: "## Welcome back (slide 26)\n\n- Check-in.\n- Preview: the ideal father — and what marriage/partnership research says about children's outcomes.",
      },
      {
        t: "The ideal father",
        c: "## The ideal father (slide 27)\n\nThe ideal father has traits and duties tied to fathering *and* to his relationship with his children's mother.\n\n**Discussion:** build the group's own 'ideal father' list on a whiteboard; compare with the deck.",
      },
      {
        t: "The benefits of marriage",
        c: "## Benefits of marriage (slide 28)\n\nThe deck summarizes research on children raised by married parents across physical, social, mental, and financial health.\n\n**Facilitator note:** handle with care for group members in other family structures — the point is what children need, not judgment.",
      },
      {
        t: "Review questions",
        c: reviewStep(
          "Whether married men live fuller, happier lives on average (slide 29, true/false).",
          "Whether a father can have *all* the ideal traits (slide 30, options a–d)."
        ),
      },
      {
        t: "Wrap-up & take-home",
        c: closing("Handbook pages for Session 6."),
      },
    ],
  },
  {
    title: "Session 7: Discipline, Morals, and Values",
    steps: [
      {
        t: "Welcome & check-in",
        c: "## Welcome back (slide 31)\n\n- Check-in.\n- Preview: discipline as teaching, not punishing — and where morals and values come from.",
      },
      {
        t: "Morals and values",
        c: "## Morals & values (slide 32)\n\n'Discipline' comes from the Latin for *to teach, to guide*. Modeling is one of the most powerful ways parents transmit morals and values — on purpose and by accident.\n\n**Discussion:** one value you want your children to carry, and how they currently see it in you.",
      },
      {
        t: "Discipline vs. punishment",
        c: "## Discipline vs. punishment (slide 33)\n\nMany fathers equate discipline with control and fear; punishment penalizes, discipline teaches. Rewards and freedoms work best used sparingly.\n\n**Discussion:** how you were disciplined growing up vs. how you want to do it.",
      },
      {
        t: "Review questions",
        c: reviewStep(
          "What best describes discipline (slide 34, options a–f).",
          "Review of morals, values, and discipline definitions (slide 35, options a–f)."
        ),
      },
      {
        t: "Wrap-up & take-home",
        c: closing("Handbook pages for Session 7; catch yourself once this week teaching instead of punishing."),
      },
    ],
  },
  {
    title: "Session 8: Children's Growth and Self-Worth",
    steps: [
      {
        t: "Welcome & check-in",
        c: "## Welcome back (slide 36)\n\n- Check-in.\n- Preview: how goals affect children's self-worth, and the nature-vs-nurture question.",
      },
      {
        t: "Goals and self-worth",
        c: "## Goals & self-worth (slide 37)\n\nChildren's self-worth rises when they meet the goals their father sets and falls when they can't. The skill: right-sized goals.\n\n**Discussion:** a goal you hold for a child — is it theirs or yours, and is it within reach?",
      },
      {
        t: "Nature or nurture?",
        c: "## Nature or nurture (slide 38)\n\nBoth shape who children become. Knowing your children's developmental milestones lets you support growth instead of fighting it.\n\n**Activity:** match ages to milestones for the group's actual kids' ages.",
      },
      {
        t: "Review questions",
        c: reviewStep(
          "The best definition of self-worth (slide 39, options a–f).",
          "Whether nature outweighs parenting (slide 40, options a–d)."
        ),
      },
      {
        t: "Wrap-up & take-home",
        c: closing("Handbook pages for Session 8."),
      },
    ],
  },
  {
    title: "Session 9: Getting Involved",
    steps: [
      {
        t: "Welcome & check-in",
        c: "## Welcome back (slide 41)\n\n- Check-in.\n- Preview: building a realistic involvement plan — whatever your custody or access situation.\n\n*(Deck note: the footers on slides 42–43 say 'Session 8' — that's a typo in the source deck; they belong to this session.)*",
      },
      {
        t: "Ways to be involved",
        c: "## Ways to be involved (slide 42)\n\nCreate a realistic plan for involvement in your children's lives — set yourself up for success rather than grand promises.\n\n**Activity:** each dad drafts 2–3 concrete involvement actions for the next month.",
      },
      {
        t: "Helping children do well in school",
        c: "## School success (slide 43)\n\nThe deck cites research: children with involved fathers get better grades and have fewer behavior problems — whether or not the father lives with them.\n\n**Discussion:** one school-connected action available to you this month.",
      },
      {
        t: "Review questions",
        c: reviewStep(
          "Whether a father without custody can still build an involvement plan (slide 44, true/false).",
          "What the research says about involved fathers and outcomes (slide 45)."
        ),
      },
      {
        t: "Wrap-up & take-home",
        c: closing("Handbook pages for Session 9; bring your involvement plan next week."),
      },
    ],
  },
  {
    title: "Session 10: Working Through Parenting Differences",
    steps: [
      {
        t: "Welcome & check-in",
        c: "## Welcome back (slide 46)\n\n- Check-in, including how involvement plans landed.\n- Preview: working through parenting differences with your children's mother.",
      },
      {
        t: "Differences in beliefs and values",
        c: "## Parenting differences (slide 47)\n\nDifferences in beliefs, morals, and values about parenting create real conflict. Solving a difference can mean changing or compromising — and getting change from the other parent starts with listening.\n\n**Discussion:** one recurring difference and what it's really about.",
      },
      {
        t: "Her point of view",
        c: "## Point of view (slide 48)\n\nOne of the hardest skills: seeing it from the other parent's side — and accepting she may never change hers.\n\n**Practice:** state the mother's position on your recurring difference so fairly she'd agree with the summary.",
      },
      {
        t: "Review questions",
        c: reviewStep(
          "What's true about parenting styles and differences (slide 49, options a–e).",
          "The most important thing when working out differences (slide 50, options a–e)."
        ),
      },
      {
        t: "Wrap-up & take-home",
        c: closing("Handbook pages for Session 10."),
      },
    ],
  },
  {
    title: "Session 11: Work and Family",
    steps: [
      {
        t: "Welcome & check-in",
        c: "## Welcome back (slide 51)\n\n- Check-in.\n- Preview: the pull between work and family, and what balance actually means.",
      },
      {
        t: "Work and family",
        c: "## Work & family (slide 52)\n\nMany fathers let work control their lives and shrink providing down to money alone.\n\n**Discussion:** the ways a father provides beyond the paycheck — time, heart, mind, spirit.",
      },
      {
        t: "Balancing work and family",
        c: "## Balance (slide 53)\n\nWork–family conflict hurts children; balance isn't only more hours at home — it's *showing* you value both.\n\n**Activity:** each dad names one visible signal of family-value he'll send this month.",
      },
      {
        t: "Review questions",
        c: reviewStep(
          "The ways a father provides for his family (slide 54, options a–f).",
          "What's true about balancing work and family (slide 55)."
        ),
      },
      {
        t: "Wrap-up & take-home",
        c: closing("Handbook pages for Session 11; next week is review and graduation."),
      },
    ],
  },
  {
    title: "Session 12: Review and Graduation",
    steps: [
      {
        t: "Welcome",
        c: "## Welcome to the final session (slide 56)\n\n- Celebrate the group making it to week 12.\n- Preview: review the whole arc, reflect, and graduate.",
      },
      {
        t: "Program review: the 5 Traits",
        c: "## The 5 Traits, revisited\n\nWalk back through Self-Awareness, Caring for Self, Relationship Skills, Parenting Skills, and Fathering Skills.\n\n**Discussion:** for each trait, one thing the group learned or changed.",
      },
      {
        t: "Reflections",
        c: "## Reflections\n\nPush a **Column feedback** activity (Push an activity → Column feedback) with columns like:\n\n1. *What I'm taking with me*\n2. *What I'm still working on*\n3. *A word for the group*\n\nRead the entries aloud as they come in.",
      },
      {
        t: "Graduation",
        c: "## Graduation\n\n- Present certificates one at a time; invite each dad to say a sentence about the father he's becoming.\n- Share local follow-on resources and how to stay connected.\n- Close the circle the way the group opened it in Session 1.",
      },
    ],
  },
];

async function main() {
  console.log(`Seeding against ${BASE}`);
  const facilitator = await api("/api/facilitators", "POST", {
    name: "Course Library",
  });
  const auth = {
    "x-facilitator-id": facilitator.id,
    "x-facilitator-secret": facilitator.key,
  };

  const course = await api(
    "/api/courses",
    "POST",
    {
      title: "24:7 Dad® A.M. (4th Edition)",
      description:
        "Facilitation companion for the NFI 24:7 Dad® A.M. program — 12 weekly sessions built on the 5 Traits of the 24:7 Dad. Each session's agenda paces the class; present the licensed NFI slide deck via Zoom screen share and use the Fathering Handbook for take-home work. Slide numbers in each step refer to 24-7-Dad-AM_PPT.pptx. Program content © National Fatherhood Initiative; this companion contains structure and facilitator guidance only.",
    },
    auth
  );
  console.log(`Course created: ${course.title}`);
  console.log(`Course code (share with co-facilitators): ${course.code}`);

  for (const s of SESSIONS) {
    const session = await api(
      `/api/courses/${course.id}/sessions`,
      "POST",
      { title: s.title },
      auth
    );
    for (const step of s.steps) {
      await api(
        `/api/sessions/${session.id}/steps`,
        "POST",
        { title: step.t, content: step.c },
        auth
      );
    }
    console.log(`  ✓ ${s.title} (${s.steps.length} steps)`);
  }
  console.log("\nDone. Join the course from the facilitator portal with the course code above.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
