export interface Partner {
  name: string;
  href: string;
  /** Override domain for logo fetching when href is a subpath of a shared platform (e.g. meetup.com) */
  logoDomain?: string;
  description?: string;
  stats?: { label: string; value: string }[];
  /** Bubble diameter tier: sm=80px, md=130px, lg=180px */
  size: 'sm' | 'md' | 'lg';
  /** Desktop canvas position as % of container — refers to bubble center */
  x: number;
  y: number;
}

export const partners: Partner[] = [
  {
    name: 'ACM at ACC',
    href: 'https://www.austincs.org/',
    size: 'sm',
    x: 12, y: 12,
  },
  {
    name: 'ACM Austin Chapter',
    href: 'https://www.meetup.com/acm-austin/',
    logoDomain: 'acm.org',
    size: 'sm',
    x: 92, y: 35,
  },
  {
    name: 'Army Software Factory',
    href: 'https://soldiersolutions.swf.army.mil/',
    logoDomain: 'army.mil',
    description: 'The Army Software Factory develops software talent and delivers digital solutions for the U.S. Army.',
    size: 'md',
    x: 38, y: 10,
  },
  {
    name: 'ATX Design Jams',
    href: 'https://www.meetup.com/meetup-group-atxdesignjam/',
    logoDomain: 'eventbrite.com',
    size: 'sm',
    x: 38, y: 58,
  },
  {
    name: 'Austin AI Alliance',
    href: 'https://austin-ai.org/',
    description: 'The Austin AI Alliance connects the local AI community through events, networking, and education.',
    size: 'lg',
    x: 22, y: 38,
  },
  {
    name: 'Austin Forum of Technology',
    href: 'https://www.austinforum.org/',
    description: 'Austin Forum on Technology & Society hosts public conversations at the intersection of technology and civic life.',
    size: 'md',
    x: 62, y: 15,
  },
  {
    name: 'Braver Angels',
    href: 'https://braverangels.org/',
    description: 'Braver Angels works to depolarize America by bringing liberals and conservatives together.',
    size: 'md',
    x: 85, y: 12,
  },
  {
    name: 'City of Austin',
    href: 'https://www.austintexas.gov/opengovernmentpartnership',
    logoDomain: 'austintexas.gov',
    description: 'The City of Austin Open Government Partnership promotes transparency, civic participation, and accountability.',
    size: 'lg',
    x: 12, y: 65,
  },
  {
    name: 'Cyversity',
    href: 'https://www.cyversity.org/',
    description: 'Cyversity increases diversity and inclusion in the cybersecurity industry through education and mentorship.',
    size: 'sm',
    x: 50, y: 32,
  },
  {
    name: 'LangChain',
    href: 'https://www.langchain.com/',
    description: 'LangChain builds tools and infrastructure for developing applications powered by large language models.',
    size: 'lg',
    x: 72, y: 42,
  },
  {
    name: 'Open Austin',
    href: 'http://open-austin.org/',
    description: 'Open Austin is a civic technology and open government organization advocating for a more open and connected Austin.',
    size: 'sm',
    x: 80, y: 60,
  },
  {
    name: 'Public Service Desk',
    href: 'https://thepublicservicedesk.org/',
    description: 'The Public Service Desk connects citizens with resources and services to strengthen community resilience.',
    size: 'md',
    x: 25, y: 85,
  },
  {
    name: 'SerpApi',
    href: 'https://serpapi.com/',
    description: 'SerpApi provides a real-time API to access search engine results, supporting research and civic technology projects.',
    size: 'md',
    x: 55, y: 70,
  },
  {
    name: 'Service Learning ACC',
    href: 'https://servicelearning.austincc.edu/',
    logoDomain: 'austincc.edu',
    description: 'Service Learning at ACC integrates community service with instruction to enrich learning and civic responsibility.',
    size: 'sm',
    x: 68, y: 85,
  },
  {
    name: 'Skull Games',
    href: 'https://skullgames.org/',
    description: 'Skull Games Society uses game design and play to build community and develop civic leadership skills.',
    size: 'sm',
    x: 88, y: 80,
  },
  {
    name: 'United Way',
    href: 'https://unitedwayaustin.org/',
    description: 'United Way for Greater Austin fights for the health, education, and financial stability of every person in our community.',
    size: 'md',
    x: 45, y: 85,
  },
];
