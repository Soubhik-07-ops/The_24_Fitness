import { Suspense } from 'react'
import MembershipPlans from '@/components/MembershipPlans/MembershipPlans'
import CTASection from '@/components/CTASection/CTASection'
import { Metadata } from 'next'
import Navbar from '@/components/Navbar/Navbar'
import Footer from '@/components/Footer/Footer'

export const metadata: Metadata = {
    title: 'Membership Plans - Choose Your Fitness Journey',
    description: 'Explore our flexible membership plans designed to fit your fitness goals and budget. Start your transformation today.',
}

export default function MembershipPage() {
    return (
        <>
            <Navbar />
            <main style={{ paddingTop: '4.5rem' }}>
                <Suspense fallback={<div style={{ minHeight: '600px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading plans...</div>}>
                    <MembershipPlans />
                </Suspense>
                <CTASection />
            </main>
            <Footer />
        </>
    )
}