// ============================================
// LIHTC Analytics Hub - Navigation System
// Unified navigation for all pages
// ============================================

(function() {
    'use strict';
    
    // Navigation configuration
    const NAV_CONFIG = {
        logo: {
            symbol: '◆',
            text: 'LIHTC Analytics'
        },
        links: [
            { text: 'Home', href: 'index.html' },
            { text: 'Dashboard', href: 'dashboard.html' },
            { text: 'Regional Data', href: 'regional.html' },
            { text: 'State Map', href: 'state-allocation-map.html' },
            { text: 'Economic Data', href: 'economic-dashboard.html' },
            { text: 'Census Data', href: 'census-dashboard.html' },
            { text: 'LIHTC Guide', href: 'lihtc-guide-for-stakeholders.html' },
            { text: 'Market Insights', href: 'insights.html' },
            { text: 'About', href: 'about.html' }
        ],
        footer: {
            tagline: 'Providing comprehensive data intelligence for affordable housing finance professionals.',
            quickLinks: [
                { text: 'Dashboard', href: 'dashboard.html' },
                { text: 'Regional Data', href: 'regional.html' },
                { text: 'Market Insights', href: 'insights.html' },
                { text: 'About', href: 'about.html' }
            ],
            resources: [
                { text: 'Novoco', href: 'https://www.novoco.com', external: true },
                { text: 'HUD LIHTC Database', href: 'https://www.huduser.gov/portal/datasets/lihtc.html', external: true },
                { text: 'NCSHA', href: 'https://www.ncsha.org', external: true }
            ],
            dataUpdate: 'Data refreshed quarterly from authoritative sources. Last update: Q1 2026.',
            copyright: '© 2026 LIHTC Analytics Hub. Educational and informational purposes.'
        }
    };
    
    // Create and inject header navigation
    function createHeader() {
        const header = document.createElement('header');
        header.style.cssText = `
            background-color: var(--bg-secondary, #2a2520);
            border-bottom: 2px solid var(--accent-gold, #d4a574);
            position: sticky;
            top: 0;
            z-index: 1000;
            min-height: 70px;
        `;
        
        const nav = document.createElement('nav');
        nav.style.cssText = `
            max-width: 1400px;
            margin: 0 auto;
            padding: 1rem 2rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
        `;
        
        // Logo
        const logoLink = document.createElement('a');
        logoLink.href = 'index.html';
        logoLink.style.cssText = `
            color: var(--accent-gold, #d4a574);
            text-decoration: none;
            font-size: 1.5rem;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        `;
        logoLink.innerHTML = `<span class="logo-icon">${NAV_CONFIG.logo.symbol}</span><span class="logo-text">${NAV_CONFIG.logo.text}</span>`;
        
        // Desktop navigation
        const navLinks = document.createElement('div');
        navLinks.className = 'nav-links';
        navLinks.style.cssText = `
            display: flex;
            gap: 1.5rem;
            align-items: center;
        `;
        
        const currentPage = window.location.pathname.split('/').pop() || 'index.html';
        
        NAV_CONFIG.links.forEach(link => {
            const a = document.createElement('a');
            a.href = link.href;
            a.textContent = link.text;
            const isActive = link.href === currentPage;
            a.style.cssText = `
                color: ${isActive ? 'var(--accent-gold, #d4a574)' : 'var(--text-primary, #e8dcc4)'};
                text-decoration: none;
                font-weight: ${isActive ? '600' : '400'};
                font-size: 0.95rem;
                transition: color 0.3s ease;
                border-bottom: ${isActive ? '2px solid var(--accent-gold, #d4a574)' : 'none'};
                padding-bottom: 0.25rem;
            `;
            a.onmouseover = () => a.style.color = 'var(--accent-gold, #d4a574)';
            a.onmouseout = () => a.style.color = isActive ? 'var(--accent-gold, #d4a574)' : 'var(--text-primary, #e8dcc4)';
            navLinks.appendChild(a);
        });
        
        // Mobile menu button
        const mobileMenuBtn = document.createElement('button');
        mobileMenuBtn.className = 'mobile-menu-btn';
        mobileMenuBtn.innerHTML = '☰';
        mobileMenuBtn.style.cssText = `
            display: none;
            background: none;
            border: none;
            color: var(--accent-gold, #d4a574);
            font-size: 1.5rem;
            cursor: pointer;
            padding: 0.5rem;
        `;
        
        // Mobile menu
        const mobileMenu = document.createElement('div');
        mobileMenu.className = 'mobile-menu';
        mobileMenu.style.cssText = `
            display: none;
            width: 100%;
            flex-direction: column;
            gap: 1rem;
            padding: 1rem 0;
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease;
        `;
        
        NAV_CONFIG.links.forEach(link => {
            const a = document.createElement('a');
            a.href = link.href;
            a.textContent = link.text;
            a.style.cssText = `
                color: var(--text-primary, #e8dcc4);
                text-decoration: none;
                padding: 0.5rem 0;
                font-size: 0.95rem;
            `;
            mobileMenu.appendChild(a);
        });
        
        mobileMenuBtn.onclick = () => {
            const isOpen = mobileMenu.style.maxHeight !== '0px' && mobileMenu.style.maxHeight !== '';
            mobileMenu.style.maxHeight = isOpen ? '0' : '500px';
        };
        
        // Responsive CSS
        const style = document.createElement('style');
        style.textContent = `
            @media (max-width: 768px) {
                .nav-links {
                    display: none !important;
                }
                .mobile-menu-btn {
                    display: block !important;
                }
                .mobile-menu {
                    display: flex !important;
                }
            }
        `;
        
        document.head.appendChild(style);
        nav.appendChild(logoLink);
        nav.appendChild(navLinks);
        nav.appendChild(mobileMenuBtn);
        header.appendChild(nav);
        header.appendChild(mobileMenu);
        
        // Insert header at the start of body
        if (document.body.firstChild) {
            document.body.insertBefore(header, document.body.firstChild);
        } else {
            document.body.appendChild(header);
        }
    }
    
    // Create and inject footer
    function createFooter() {
        const footer = document.createElement('footer');
        footer.style.cssText = `
            background-color: var(--bg-secondary, #2a2520);
            border-top: 2px solid var(--accent-gold, #d4a574);
            margin-top: 4rem;
            padding: 3rem 2rem 2rem;
        `;
        
        const container = document.createElement('div');
        container.style.cssText = `
            max-width: 1400px;
            margin: 0 auto;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 2rem;
            margin-bottom: 2rem;
        `;
        
        // About section
        const aboutSection = document.createElement('div');
        aboutSection.innerHTML = `
            <h4 style="color: var(--accent-gold, #d4a574); margin-bottom: 1rem; font-size: 1.1rem;">LIHTC Analytics Hub</h4>
            <p style="color: var(--text-secondary, rgba(232, 220, 196, 0.8)); font-size: 0.9rem; line-height: 1.6;">
                ${NAV_CONFIG.footer.tagline}
            </p>
        `;
        
        // Quick links
        const quickLinksSection = document.createElement('div');
        const quickLinksHTML = NAV_CONFIG.footer.quickLinks.map(link => 
            `<a href="${link.href}" style="color: var(--text-secondary, rgba(232, 220, 196, 0.8)); text-decoration: none; font-size: 0.9rem; display: block; margin-bottom: 0.5rem; transition: color 0.3s;">${link.text}</a>`
        ).join('');
        quickLinksSection.innerHTML = `
            <h4 style="color: var(--accent-gold, #d4a574); margin-bottom: 1rem; font-size: 1.1rem;">Quick Links</h4>
            ${quickLinksHTML}
        `;
        
        // Resources
        const resourcesSection = document.createElement('div');
        const resourcesHTML = NAV_CONFIG.footer.resources.map(link => 
            `<a href="${link.href}" ${link.external ? 'target="_blank" rel="noopener"' : ''} style="color: var(--text-secondary, rgba(232, 220, 196, 0.8)); text-decoration: none; font-size: 0.9rem; display: block; margin-bottom: 0.5rem; transition: color 0.3s;">${link.text}</a>`
        ).join('');
        resourcesSection.innerHTML = `
            <h4 style="color: var(--accent-gold, #d4a574); margin-bottom: 1rem; font-size: 1.1rem;">Resources</h4>
            ${resourcesHTML}
        `;
        
        // Data updates
        const dataSection = document.createElement('div');
        dataSection.innerHTML = `
            <h4 style="color: var(--accent-gold, #d4a574); margin-bottom: 1rem; font-size: 1.1rem;">Data Updates</h4>
            <p style="color: var(--text-secondary, rgba(232, 220, 196, 0.8)); font-size: 0.9rem; line-height: 1.6;">
                ${NAV_CONFIG.footer.dataUpdate}
            </p>
        `;
        
        container.appendChild(aboutSection);
        container.appendChild(quickLinksSection);
        container.appendChild(resourcesSection);
        container.appendChild(dataSection);
        
        // Copyright
        const copyright = document.createElement('div');
        copyright.style.cssText = `
            text-align: center;
            color: var(--text-secondary, rgba(232, 220, 196, 0.8));
            font-size: 0.85rem;
            padding-top: 2rem;
            border-top: 1px solid var(--border-color, #3a3530);
        `;
        copyright.textContent = NAV_CONFIG.footer.copyright;
        
        footer.appendChild(container);
        footer.appendChild(copyright);
        document.body.appendChild(footer);
    }
    
    // Initialize navigation when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            createHeader();
            createFooter();
        });
    } else {
        createHeader();
        createFooter();
    }
    
    console.log('✓ Navigation system loaded');
})();
