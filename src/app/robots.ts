import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
    const baseUrl = 'https://www.the24fitness.co.in'

    return {
        rules: [
            {
                userAgent: '*',
                allow: '/',
                disallow: [
                    '/admin/',
                    '/api/',
                    '/trainer/',
                    '/dashboard/',
                    '/profile/',
                    '/membership/form',
                    '/membership/payment',
                    '/messages/',
                ],
            },
        ],
        sitemap: `${baseUrl}/sitemap.xml`,
    }
}

