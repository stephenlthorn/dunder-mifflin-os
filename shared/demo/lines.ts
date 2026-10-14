// What the demo bots say and do between scripted beats: canned chat replies (original lines written in each
// character's voice, no quotes from the show) and small "ambient" jobs an idle bot picks up. Fiction only.

/** Replies when you message a bot (or a room it leads) in demo mode. */
export const REPLIES: Readonly<Record<string, ReadonlyArray<string>>> = Object.freeze({
  frontdesk: [
    "Got it! I'll pass that along and let you know when it's sorted.",
    "Sure thing. It's on today's handoff list.",
    'Noted. I put it at the top of the pile, the real top.',
  ],
  manager: [
    "Love it. Let's make it a Council item.",
    'Great idea. I was literally about to say that.',
    'Consider it done. Well, considered. Doing is next.',
  ],
  sales: [
    'Understood. I will handle it personally, which is the only way it gets handled correctly.',
    'Request logged. Expect results by end of day. Expect them.',
    'On it. I have already drafted three backup plans.',
  ],
  accounts: [
    "Fine. Send it with a receipt and I'll review it.",
    'Noted. It will be done properly, unlike some things around here.',
    "I'll look at it after the reconciliation. Not before.",
  ],
  analyst: [
    'Good question. Let me pull the numbers before anyone guesses.',
    "The data says something slightly different. I'll send a summary.",
    "I'll check it twice. Once for me, once for Michael.",
  ],
  imports: [
    'Okay. I can do that. Probably.',
    'Got it. Doing it now. Slowly, but now.',
    'Sure. Is there food involved? Asking for the import.',
  ],
  social: [
    'Omg yes, adding it to the content calendar right now!',
    'Love this. Drafting three versions, obviously.',
    'On it! This is going to get so many likes.',
  ],
  community: [
    "You got it! I'll rally the community.",
    "Absolutely. I'll make it a whole event.",
    'Great call. I already have a song for it.',
  ],
  research: [
    "Interesting. I'll fold it into this week's AI digest.",
    'Big if true. Let me look into it.',
    "I'm across it. Strategically.",
  ],
  strategy: [
    "Thanks. I'll take it to the next strategy review.",
    "Good thinking. Let's see the numbers first.",
    'Noted. Corporate will want a one-pager.',
  ],
  it: [
    "Okay, I'll open a ticket and take a look.",
    'Restarting it now; give me two minutes.',
    "Rebooted it. Fixed. You're welcome.",
  ],
  assistant: [
    'Done. Anything else?',
    "On it. I'll summarise when it's finished.",
    'Added to your list. You have four things today; this is the easiest.',
  ],
  wellness: [
    "Good. First, drink some water. Then we'll talk.",
    'Noted. Remember to stretch at the top of the hour.',
    'Discipline is a habit. So is lunch. Have both.',
  ],
});

export const FALLBACK_REPLY = 'Got it. (This is a demo: replies are canned.)';

/** Small things an idle bot does between scripted beats; the seed picks when and which. */
export const AMBIENT: Readonly<Record<string, ReadonlyArray<string>>> = Object.freeze({
  frontdesk: ['Answering the phones', 'Updating the visitor log', 'Ordering more paper'],
  manager: ['Brainstorming in the whiteboard app', 'Reading the suggestion box'],
  sales: ['Researching a new lead', 'Updating the CRM'],
  accounts: ['Filing receipts', 'Checking petty cash'],
  analyst: ['Cleaning up a spreadsheet', 'Checking a formula'],
  imports: ['Sorting the vendor files', 'Re-reading the import docs'],
  social: ['Scrolling for trends', 'Editing a caption'],
  community: ['Answering a forum post', 'Updating the events page'],
  research: ['Reading a new paper', 'Testing a new model'],
  strategy: ['Reviewing the branch numbers'],
  it: ['Updating a server', 'Resetting a password'],
  assistant: ['Tidying the shared drive', 'Answering a quick question'],
  wellness: ["Planning tomorrow's stretches", 'Logging water intake'],
});
