/**
 * Blog Posts Dynamic Loader
 * Fetches and displays blog posts from WordPress JSON API
 */

(function() {
    'use strict';

    const BLOG_API_URL = 'https://www.kzoomakers.org/news/wp-json/wp/v2/posts';
    const MEDIA_API_URL = 'https://www.kzoomakers.org/news/wp-json/wp/v2/media';
    const MAX_POSTS_HOMEPAGE = 3; // Number of posts to show on homepage
    const MAX_POSTS_BLOG_PAGE = 24; // Number of posts to show on blog page

    /**
     * Fetch blog posts from WordPress API
     */
    async function fetchBlogPosts(limit = MAX_POSTS_HOMEPAGE) {
        try {
            const response = await fetch(`${BLOG_API_URL}?per_page=${limit}&_embed`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const posts = await response.json();
            return posts;
        } catch (error) {
            console.error('Error fetching blog posts:', error);
            return [];
        }
    }

    /**
     * Extract excerpt text from HTML
     */
    function extractExcerpt(htmlContent, maxLength = 150) {
        const div = document.createElement('div');
        div.innerHTML = htmlContent;
        const text = div.textContent || div.innerText || '';
        
        if (text.length <= maxLength) {
            return text;
        }
        
        return text.substr(0, maxLength).trim() + '...';
    }

    /**
     * Get featured image URL from post
     */
    function getFeaturedImage(post) {
        // Try to get embedded media first
        if (post._embedded && post._embedded['wp:featuredmedia']) {
            const media = post._embedded['wp:featuredmedia'][0];
            if (media && media.source_url) {
                return media.source_url;
            }
        }
        
        // Fallback to a default image
        return 'images/blog/post-1.jpg';
    }

    /**
     * Format date to readable format
     */
    function formatDate(dateString) {
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', options);
    }

    /**
     * Create HTML for a single blog post card
     */
    function createPostCard(post) {
        const title = post.title.rendered;
        const excerpt = extractExcerpt(post.excerpt.rendered);
        const link = post.link;
        const imageUrl = getFeaturedImage(post);
        const date = formatDate(post.date);

        return `
            <article class="col-lg-4 col-md-6 mb-4">
                <div class="post-item">
                    <div class="media-wrapper">
                        <img loading="lazy" src="${imageUrl}" alt="${title}" class="img-fluid" onerror="this.src='images/blog/post-1.jpg'">
                    </div>
                    <div class="content">
                        <p class="post-date"><small>${date}</small></p>
                        <h3><a href="${link}" target="_blank" rel="noopener noreferrer">${title}</a></h3>
                        <p>${excerpt}</p>
                        <a class="btn btn-main" href="${link}" target="_blank" rel="noopener noreferrer">Read more</a>
                    </div>
                </div>
            </article>
        `;
    }

    /**
     * Render blog posts to the page
     */
    function renderBlogPosts(posts, containerId) {
        const container = document.getElementById(containerId);
        
        if (!container) {
            console.error(`Container with id "${containerId}" not found`);
            return;
        }

        if (posts.length === 0) {
            container.innerHTML = `
                <div class="col-12 text-center">
                    <p>No blog posts available at the moment. Check back soon!</p>
                </div>
            `;
            return;
        }

        const postsHTML = posts.map(post => createPostCard(post)).join('');
        container.innerHTML = postsHTML;
    }

    /**
     * Initialize blog posts on homepage
     */
    async function initHomepageBlog() {
        const container = document.getElementById('blog-posts-container');
        if (!container) return;

        const posts = await fetchBlogPosts(MAX_POSTS_HOMEPAGE);
        renderBlogPosts(posts, 'blog-posts-container');
    }

    /**
     * Initialize blog posts on blog page
     */
    async function initBlogPage() {
        const container = document.querySelector('.posts .container .row');
        if (!container) {
            console.error('Blog container not found');
            return;
        }

        // Clear existing static content
        container.innerHTML = '<div class="col-12 text-center"><p>Loading posts...</p></div>';

        const posts = await fetchBlogPosts(MAX_POSTS_BLOG_PAGE);
        
        if (posts.length === 0) {
            container.innerHTML = `
                <div class="col-12 text-center">
                    <p>No blog posts available at the moment. Check back soon!</p>
                </div>
            `;
            return;
        }

        const postsHTML = posts.map(post => createPostCard(post)).join('');
        container.innerHTML = postsHTML;
    }

    /**
     * Initialize based on current page
     */
    function init() {
        // Check if we're on the homepage
        if (document.getElementById('blog-posts-container')) {
            initHomepageBlog();
        }
        
        // Check if we're on the blog/news page
        if (document.body.classList.contains('blog-page') ||
            window.location.pathname.includes('blog.html') ||
            window.location.pathname.includes('news.html')) {
            initBlogPage();
        }
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();