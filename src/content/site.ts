export const site = {
  coupleNames: 'Alannah & Rob',
  dateText: 'Friday, August 28 2026',
  date: '28/08/2026',
  day2Date: '29/08/2026',
  day2DateText: 'Saturday, August 29 2026',
  locationHotel: 'The Lough Erne Resort',
  locationText: 'Enniskillen, Co. Fermanagh',
  // Serve from the bundled assets (better for static S3 hosting)
  heroImage: '/photos/hero.jpg',
  // heroImage: 'https://YOUR_CLOUDFRONT_DOMAIN/photos/hero.jpg',
  rsvpDeadline: 'Kindly RSVP by June 28, 2026',
  galleryImages: [
    '/photos/1.svg',
    '/photos/2.svg',
    '/photos/3.svg',
    '/photos/4.svg',
    '/photos/5.svg',
    '/photos/6.svg',
    '/photos/7.svg',
    '/photos/8.svg',
    '/photos/9.svg',
    '/photos/10.svg',
    '/photos/11.svg',
    '/photos/12.svg',
  ],
  weekendSchedule: [
    {
      title: 'Day 1 • Ceremony',
      date: 'Friday Afternoon',
      events: [
        {
          time: '1:00 PM',
          title: 'Wedding Mass',
          location: 'St. Mary’s Catholic Church, Arney',
          description: 'Join us for a traditional wedding mass to celebrate our union.',
        },
      ],
    },
    {
      title: 'Day 1 • Reception',
      date: 'Friday Evening',
      events: [
        {
          time: '3:00 PM',
          title: 'Cocktails & Canapés',
          location: 'Bar & Terrace',
          description: 'Signature drinks and local snacks with live acoustic music.',
        },
        {
          time: '6:00 PM',
          title: 'Reception',
          location: 'Main Hall',
          description: 'Dinner, dancing, and toasts. Bring your best moves.',
        },
      ],
    },
    {
      title: 'Day 2 • Drinks & Music',
      date: 'Saturday',
      events: [
        {
          time: '3:00 PM',
          title: 'Afternoon Drinks',
          location: 'Charlie’s Bar',
          description: 'Relaxed vibes with drinks and light bites.',
        },
      ],
    },
  ],
  travel: {
    gettingThere: [
      'Nearest airport: Placeholder Airport (APL), 35 minutes by car.',
      'Rideshare and taxis are available; rental cars recommended for flexibility.',
      'Venue address: 123 Celebration Lane, Somewhere, USA.',
    ],
    areaRecommendations: [
      {
        name: 'Old Town Stroll',
        detail: 'Cute boutiques, coffee shops, and a small farmer’s market on Saturdays.',
      },
      {
        name: 'Lakeside Park',
        detail: 'Picnic tables, paddle boats, and sunset views.',
      },
      {
        name: 'Main Street Eats',
        detail: 'Pizza, tacos, and a bakery with excellent cinnamon rolls.',
      },
    ],
    accommodations: [
      {
        name: 'The Grove Hotel',
        distance: '5 min walk to venue',
        price: '$$',
        notes: 'Block of rooms reserved; mention the wedding for the group rate.',
        link: '#',
      },
      {
        name: 'Riverside Inn',
        distance: '10 min drive',
        price: '$',
        notes: 'Cozy and budget-friendly with a nice breakfast spread.',
        link: '#',
      },
      {
        name: 'Hilltop Suites',
        distance: '8 min drive',
        price: '$$$',
        notes: 'Spacious rooms and a pool; good for families.',
        link: '#',
      },
    ],
    faq: [
      {
        question: 'What is the dress code?',
        answer: 'Garden cocktail. Heels not required; the lawn is flat but grassy.',
      },
      {
        question: 'Can I bring kids?',
        answer: 'We love your kiddos! Daytime events are family-friendly; reception is adults-focused.',
      },
      {
        question: 'Is parking available?',
        answer: 'Yes, free parking onsite. Carpooling is appreciated.',
      },
    ],
  },
} as const;

export type SiteContent = typeof site;
