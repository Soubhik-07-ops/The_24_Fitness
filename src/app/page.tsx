// src/app/page.tsx (HOME PAGE WITH NAVBAR/FOOTER)
import Navbar from '@/components/Navbar/Navbar';
import Footer from '@/components/Footer/Footer';
import Features from '@/components/Features/Features';
import Testimonials from '@/components/Testimonials/Testimonials';
import Hero from '@/components/Hero_section/Hero';
import CTASection from '@/components/CTASection/CTASection';
import MembershipPlans from '@/components/MembershipPlans/MembershipPlans';
import Stats from '@/components/Stats/Stats';

export default function Home() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Gym',
    name: 'The 24 Fitness Gym',
    description: 'Premium Gym & Fitness Center with 24/6 access, expert trainers, and modern equipment',
    url: 'https://www.the24fitness.co.in',
    logo: 'https://www.the24fitness.co.in/Brand LOGO.png',
    image: 'https://www.the24fitness.co.in/Brand LOGO.png',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Digwadih No. 10, near Gobinda sweets, Old SBI Building',
      addressLocality: 'Digwadih',
      addressCountry: 'IN',
    },
    telephone: '8084548055',
    email: 'The24fitness8055@gmail.com',
    openingHours: 'Mo-Sa 00:00-23:59',
    priceRange: '₹₹',
    sameAs: [
      // Add your social media links here when available
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <Navbar />
      <main>
        <Hero />
        <Stats />
        <Features />
        <MembershipPlans />
        <Testimonials />
        <CTASection />
      </main>
      <Footer />
    </>
  );
}