export interface Testimonial {
  quote: string;
  name: string;
  title: string;
  organization: string;
  image?: string;
}

export const testimonials: Testimonial[] = [
  {
    quote: "The tabletop exercise transformed how my students engage with cybersecurity concepts. They were solving real problems, not just reading about them.",
    name: "Coming Soon",
    title: "Professor",
    organization: "Austin Community College",
  },
  {
    quote: "CGCS worked with us to design a simulation that addressed exactly the team dynamics challenges we were facing. The experience was eye-opening.",
    name: "Coming Soon",
    title: "Manager",
    organization: "Local Organization",
  },
  {
    quote: "Our students left the simulation with a completely different understanding of crisis management. You can't get that from a textbook.",
    name: "Coming Soon",
    title: "Department Chair",
    organization: "Austin Community College",
  },
];
