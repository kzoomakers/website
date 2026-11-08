/**
 * Dynamic Pricing Special Badge System
 * Updates the special pricing badges based on current date
 * Shows seasonal specials and US holiday specials
 */

(function() {
    'use strict';

    // Get current date in user's timezone
    function getCurrentDate() {
        return new Date();
    }

    // Check if date matches a specific month and day
    function isDate(date, month, day) {
        return date.getMonth() === month - 1 && date.getDate() === day;
    }

    // Check if date is within a range
    function isInRange(date, startMonth, startDay, endMonth, endDay) {
        const current = date.getMonth() * 100 + date.getDate();
        const start = (startMonth - 1) * 100 + startDay;
        const end = (endMonth - 1) * 100 + endDay;
        
        if (start <= end) {
            return current >= start && current <= end;
        } else {
            // Handle year wrap (e.g., Dec to Jan)
            return current >= start || current <= end;
        }
    }

    // Check if date is within 7 days before or after a specific date
    function isWithinTwoWeeks(date, targetMonth, targetDay) {
        const currentDate = new Date(date);
        const targetDate = new Date(date.getFullYear(), targetMonth - 1, targetDay);
        
        // Calculate difference in days
        const diffTime = currentDate - targetDate;
        const diffDays = Math.abs(Math.floor(diffTime / (1000 * 60 * 60 * 24)));
        
        return diffDays <= 7;
    }

    // Get the current special message
    function getSpecialMessage(date) {
        const month = date.getMonth() + 1; // 1-12
        const day = date.getDate();

        // US Holidays (2 weeks surrounding each holiday: 7 days before and 7 days after)
        // Holidays take priority over seasonal specials
        
        // New Year's Day - January 1 (Dec 25 - Jan 8)
        if (isWithinTwoWeeks(date, 1, 1)) {
            return "New Year's Special!";
        }

        // Martin Luther King Jr. Day - Third Monday of January (approx Jan 15-21)
        // Check around Jan 18 (typical date)
        if (isWithinTwoWeeks(date, 1, 18)) {
            return "MLK Day Special!";
        }

        // Valentine's Day - February 14 (Feb 7 - Feb 21)
        if (isWithinTwoWeeks(date, 2, 14)) {
            return "Valentine's Day Special!";
        }

        // Presidents' Day - Third Monday of February (approx Feb 15-21)
        // Check around Feb 18 (typical date)
        if (isWithinTwoWeeks(date, 2, 18)) {
            return "Presidents' Day Special!";
        }

        // St. Patrick's Day - March 17 (Mar 10 - Mar 24)
        if (isWithinTwoWeeks(date, 3, 17)) {
            return "St. Patrick's Day Special!";
        }

        // Earth Day - April 22 (Apr 15 - Apr 29)
        if (isWithinTwoWeeks(date, 4, 22)) {
            return "Earth Day Special!";
        }

        // Cinco de Mayo - May 5 (Apr 28 - May 12)
        if (isWithinTwoWeeks(date, 5, 5)) {
            return "Cinco de Mayo Special!";
        }

        // Mother's Day - Second Sunday of May (approx May 8-14)
        // Check around May 11 (typical date)
        if (isWithinTwoWeeks(date, 5, 11)) {
            return "Mother's Day Special!";
        }

        // Memorial Day - Last Monday of May (approx May 25-31)
        // Check around May 28 (typical date)
        if (isWithinTwoWeeks(date, 5, 28)) {
            return "Memorial Day Special!";
        }

        // Father's Day - Third Sunday of June (approx Jun 15-21)
        // Check around Jun 18 (typical date)
        if (isWithinTwoWeeks(date, 6, 18)) {
            return "Father's Day Special!";
        }

        // Juneteenth - June 19 (Jun 12 - Jun 26)
        if (isWithinTwoWeeks(date, 6, 19)) {
            return "Juneteenth Special!";
        }

        // Independence Day - July 4 (Jun 27 - Jul 11)
        if (isWithinTwoWeeks(date, 7, 4)) {
            return "Independence Day Special!";
        }

        // Labor Day - First Monday of September (approx Sep 1-7)
        // Check around Sep 4 (typical date)
        if (isWithinTwoWeeks(date, 9, 4)) {
            return "Labor Day Special!";
        }

        // Indigenous Peoples' Day - Second Monday of October (approx Oct 8-14)
        // Check around Oct 11 (typical date)
        if (isWithinTwoWeeks(date, 10, 11)) {
            return "Indigenous Peoples' Day Special!";
        }

        // Halloween - October 31 (Oct 24 - Nov 7)
        if (isWithinTwoWeeks(date, 10, 31)) {
            return "Halloween Special!";
        }

        // Veterans Day - November 11 (Nov 4 - Nov 18)
        if (isWithinTwoWeeks(date, 11, 11)) {
            return "Veterans Day Special!";
        }

        // Seasonal Specials (if no holiday matches)
        
        // Winter: December 21 - March 19
        if (isInRange(date, 12, 21, 3, 19)) {
            return "Winter Special!";
        }

        // Spring: March 20 - June 20
        if (isInRange(date, 3, 20, 6, 20)) {
            return "Spring Special!";
        }

        // Summer: June 21 - September 21
        if (isInRange(date, 6, 21, 9, 21)) {
            return "Summer Special!";
        }

        // Fall: September 22 - December 20
        if (isInRange(date, 9, 22, 12, 20)) {
            return "Fall Special!";
        }

        // Default fallback (should never reach here due to seasonal coverage)
        return null;
    }

    // Update the pricing badges
    function updatePricingBadges() {
        const currentDate = getCurrentDate();
        const specialMessage = getSpecialMessage(currentDate);
        
        // Get all offer badges
        const offerBadges = document.querySelectorAll('.offer-badge');
        
        // Get all normal price labels
        const normalPriceLabels = document.querySelectorAll('.normal-price-label');
        
        if (specialMessage) {
            // Update badge text
            offerBadges.forEach(badge => {
                badge.textContent = specialMessage;
                badge.style.display = 'inline-block';
            });
            
            // Show normal price labels
            normalPriceLabels.forEach(label => {
                label.style.display = 'block';
            });
        } else {
            // Hide badges and normal price labels if no special
            offerBadges.forEach(badge => {
                badge.style.display = 'none';
            });
            
            normalPriceLabels.forEach(label => {
                label.style.display = 'none';
            });
        }
    }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', updatePricingBadges);
    } else {
        updatePricingBadges();
    }

})();