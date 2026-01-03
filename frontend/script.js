// Smooth scroll for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Tab switching for architecture section
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.arch-tab-content');

tabButtons.forEach(button => {
    button.addEventListener('click', () => {
        const targetTab = button.getAttribute('data-tab');
        
        // Remove active class from all buttons and contents
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));
        
        // Add active class to clicked button and corresponding content
        button.classList.add('active');
        document.getElementById(targetTab).classList.add('active');
    });
});

// Navbar background on scroll
const navbar = document.querySelector('.navbar');
let lastScroll = 0;

window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;
    
    if (currentScroll > 50) {
        navbar.style.backgroundColor = 'rgba(0, 0, 0, 0.95)';
        navbar.style.boxShadow = '0 1px 3px rgba(212, 175, 55, 0.2)';
    } else {
        navbar.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
        navbar.style.boxShadow = 'none';
    }
    
    lastScroll = currentScroll;
});

// Intersection Observer for fade-in animations
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observe all cards and sections
document.querySelectorAll('.problem-card, .feature-card, .arch-item').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
    observer.observe(el);
});

// Button hover effects
document.querySelectorAll('.btn').forEach(button => {
    button.addEventListener('mouseenter', function() {
        this.style.transform = 'translateY(-2px)';
    });
    
    button.addEventListener('mouseleave', function() {
        this.style.transform = 'translateY(0)';
    });
});

// Smooth reveal for hero content
window.addEventListener('load', () => {
    const heroContent = document.querySelector('.hero-content');
    if (heroContent) {
        heroContent.style.opacity = '0';
        heroContent.style.transform = 'translateY(30px)';
        heroContent.style.transition = 'opacity 1s ease-out, transform 1s ease-out';
        
        setTimeout(() => {
            heroContent.style.opacity = '1';
            heroContent.style.transform = 'translateY(0)';
        }, 100);
    }
});

// Paper rotation animation with resume reveal
const paperContainer = document.querySelector('.paper-container');
const paperWrapper = document.querySelector('.paper-wrapper');
const hero = document.querySelector('.hero');

// Update paper rotation and floating based on scroll position
function updatePaperRotation() {
    if (!hero || !paperWrapper) return;
    
    const scrolled = window.pageYOffset;
    const heroTop = hero.offsetTop;
    const heroHeight = hero.offsetHeight;
    const windowHeight = window.innerHeight;
    
    // Calculate scroll progress through hero section (0 to 1)
    // Make animation complete even earlier so ending frame is visible when scrolling down
    const scrollStart = heroTop - windowHeight * .3;
    const scrollEnd = heroTop + heroHeight * 0.3; // Complete much earlier (at 25% of hero height)
    const scrollRange = scrollEnd - scrollStart;
    
    let scrollProgress = 0;
    if (scrollRange > 0) {
        scrollProgress = Math.max(0, Math.min(1, (scrolled - scrollStart) / scrollRange));
    }
    
    // Apply easing to make animation feel smoother
    // Ease-out cubic for smooth deceleration, but ensure it reaches 1.0 for full 360 rotation
    const easedProgress = Math.min(1, 1 - Math.pow(1 - scrollProgress, 3));
    
    // Starting state: slight tilt (rotateX -8deg, rotateZ 3deg)
    // Ending state: completely flat (rotateX 0deg, rotateZ 0deg, rotateY 0deg)
    // Paper should be parallel to screen at the end
    const startTiltX = -8; // Slight backward tilt
    const startTiltZ = 1; // Slight rotation
    const endTiltX = 0;
    const endTiltZ = 0;
    
    // Interpolate tilt from start to end using eased progress
    const tiltX = startTiltX + (endTiltX - startTiltX) * easedProgress;
    const tiltZ = startTiltZ + (endTiltZ - startTiltZ) * easedProgress;
    
    // Rotate paper continuously as user scrolls (can go beyond 360 degrees)
    // At 0% scroll: 0 degrees Y rotation (blank front visible, with slight tilt)
    // At 50% scroll: 180 degrees Y rotation (resume back visible)
    // At 100% scroll: 360+ degrees (continues rotating beyond full rotation)
    const rotationY = easedProgress * 720;
    
    // Continuous floating effect (smooth sine wave)
    const floatTime = Date.now() / 1000; // 1.5 seconds per cycle
    const floatOffset = Math.sin(floatTime) * 15; // 15px up/down movement
    
    // Apply rotation, tilt, and floating to paper wrapper
    paperWrapper.style.transform = `
        translateY(${floatOffset}px) 
        rotateX(${tiltX}deg) 
        rotateY(${rotationY}deg) 
        rotateZ(${tiltZ}deg)
    `;
    paperWrapper.style.animation = 'none'; // Disable CSS animation, use JS control
    
    // Fade in resume content on front as it rotates back (after 180 degrees)
    // Starting frame must be completely blank - no text visible
    const resumeFront = document.querySelector('.resume-content-front');
    if (resumeFront) {
        // Start fading in after 50% of eased progress (when rotating back to front)
        const fadeStart = .8;
        if (easedProgress > fadeStart) {
            const fadeProgress = (easedProgress - fadeStart) / (1 - fadeStart);
            resumeFront.style.opacity = Math.min(1, fadeProgress);
            resumeFront.style.visibility = 'visible';
            resumeFront.classList.add('visible');
        } else {
            // Completely hide at start - no text visible
            resumeFront.style.opacity = 0;
            resumeFront.style.visibility = 'hidden';
            resumeFront.classList.remove('visible');
        }
    }
    
    // Subtle parallax movement for container
    const parallaxOffset = easedProgress * 100;
    if (paperContainer) {
        paperContainer.style.transform = `translate(-40%, calc(-50% + ${parallaxOffset * 0.2}px)) translateZ(0)`;
    }
    
    // Continue animation loop
    requestAnimationFrame(updatePaperRotation);
}

// Initialize rotation - start flat and floating
document.addEventListener('DOMContentLoaded', () => {
    // Ensure resume content is completely hidden at start
    const resumeFront = document.querySelector('.resume-content-front');
    if (resumeFront) {
        resumeFront.style.opacity = 0;
        resumeFront.style.visibility = 'hidden';
        resumeFront.classList.remove('visible');
    }
    updatePaperRotation(); // Start continuous animation loop
});

// Event listeners
window.addEventListener('resize', updatePaperRotation);

// Add ripple effect styles dynamically
const style = document.createElement('style');
style.textContent = `
    .btn {
        position: relative;
        overflow: hidden;
    }
    
    .ripple {
        position: absolute;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.6);
        transform: scale(0);
        animation: ripple-animation 0.6s ease-out;
        pointer-events: none;
    }
    
    @keyframes ripple-animation {
        to {
            transform: scale(4);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// reCAPTCHA v2 handling (Checkbox)
let captchaWidgets = {};
let captchaVerified = {};
let recaptchaReady = false;

// Wait for reCAPTCHA to load
function waitForRecaptcha() {
    return new Promise((resolve, reject) => {
        // Check if already loaded
        if (typeof grecaptcha !== 'undefined') {
            recaptchaReady = true;
            resolve();
            return;
        }
        
        // Wait for script to load
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds max wait
        
        const checkInterval = setInterval(() => {
            attempts++;
            
            if (typeof grecaptcha !== 'undefined') {
                clearInterval(checkInterval);
                recaptchaReady = true;
                console.log('reCAPTCHA loaded');
                resolve();
            } else if (attempts >= maxAttempts) {
                clearInterval(checkInterval);
                reject(new Error('reCAPTCHA script failed to load'));
            }
        }, 100);
    });
}

function onCaptchaSuccess(token, captchaId) {
    captchaVerified[captchaId] = true;
    window.recaptchaToken = token; // Store token globally for use in upload page
    console.log('reCAPTCHA verified for:', captchaId);
    // Navigate after successful verification
    setTimeout(() => {
        window.location.href = 'upload.html';
    }, 100);
}

function onCaptchaExpired(captchaId) {
    captchaVerified[captchaId] = false;
    window.recaptchaToken = null; // Clear token on expiration
    console.log('reCAPTCHA expired for:', captchaId);
}

async function handleGetStarted(captchaContainerId, wrapperId) {
    const wrapper = document.getElementById(wrapperId);
    const container = document.getElementById(captchaContainerId);
    
    if (!wrapper || !container) {
        console.error('Captcha elements not found');
        return;
    }
    
    // If captcha is already verified, navigate immediately
    if (captchaVerified[captchaContainerId]) {
        window.location.href = 'upload.html';
        return;
    }
    
    // Wait for reCAPTCHA to load if not ready
    if (!recaptchaReady && typeof grecaptcha === 'undefined') {
        const button = document.getElementById('getStartedBtn') || document.getElementById('getStartedFreeBtn');
        if (button) {
            const originalText = button.textContent;
            button.textContent = 'Loading...';
            button.disabled = true;
        }
        
        try {
            await waitForRecaptcha();
            if (button) {
                button.textContent = originalText;
                button.disabled = false;
            }
        } catch (error) {
            console.error('reCAPTCHA failed to load:', error);
            if (button) {
                button.textContent = originalText;
                button.disabled = false;
            }
            alert('reCAPTCHA failed to load. Please refresh the page and try again.');
            return;
        }
    }
    
    // Show the wrapper
    wrapper.style.display = 'flex';
    
    // If captcha widget doesn't exist, create it
    if (!captchaWidgets[captchaContainerId]) {
        try {
            captchaWidgets[captchaContainerId] = grecaptcha.render(container, {
                'sitekey': '6Ldwfz4sAAAAAA_Nv9zTiENK2Q1dhnS0qaDzV13J',
                'callback': function(token) {
                    onCaptchaSuccess(token, captchaContainerId);
                },
                'expired-callback': function() {
                    onCaptchaExpired(captchaContainerId);
                }
            });
            console.log('reCAPTCHA widget created for:', captchaContainerId);
        } catch (error) {
            console.error('Error rendering reCAPTCHA:', error);
            alert('Error loading captcha: ' + error.message + '\n\nPlease refresh the page.');
        }
    } else {
        // If widget exists but not verified, show it and reset if needed
        if (!captchaVerified[captchaContainerId]) {
            grecaptcha.reset(captchaWidgets[captchaContainerId]);
        }
    }
}

// Button ripple effects
document.addEventListener('DOMContentLoaded', function() {
    // Add ripple effect to buttons
    document.querySelectorAll('.btn-primary:not(a)').forEach(button => {
        button.addEventListener('click', function(e) {
            // Add ripple effect
            const ripple = document.createElement('span');
            const rect = button.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            const x = e.clientX - rect.left - size / 2;
            const y = e.clientY - rect.top - size / 2;
            
            ripple.style.width = ripple.style.height = size + 'px';
            ripple.style.left = x + 'px';
            ripple.style.top = y + 'px';
            ripple.classList.add('ripple');
            
            button.appendChild(ripple);
            
            setTimeout(() => {
                ripple.remove();
            }, 600);
        });
    });
});
