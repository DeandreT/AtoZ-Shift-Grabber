// ==UserScript==
// @name         Amazon AtoZ Auto-Shift Grabber
// @namespace    deandre.t
// @version      0.6
// @description  Auto-refresh AtoZ, configurable day targeting, auto-clicks "Stay Logged In", multiple shift selection with overlap detection
// @author       DeandreT
// @match        https://atoz.amazon.work/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Configuration
    let autoRefreshEnabled = true;
    let targetDay = 4; // Thursday (0=Sunday, 1=Monday, ..., 4=Thursday, 6=Saturday)
    let startTime = "15:00"; // 3:00 PM (24-hour format)
    let endTime = "21:00"; // 9:00 PM (24-hour format)
    let autoAddShiftsEnabled = true;
    let testModeEnabled = false;
    let shiftPreference = "earliest"; // "earliest" or "latest" shift within time frame
    let multipleShiftsEnabled = false; // Allow picking up multiple shifts
    let maxShifts = 3; // Maximum number of shifts to pick up

    // Load saved preferences from localStorage
    function loadPreferences() {
        try {
            const savedRefresh = localStorage.getItem('shiftSelector_autoRefresh');
            const savedDay = localStorage.getItem('shiftSelector_targetDay');
            const savedTimeFrames = localStorage.getItem('shiftSelector_timeFrames');
            const savedAutoAdd = localStorage.getItem('shiftSelector_autoAdd');
            const savedTestMode = localStorage.getItem('shiftSelector_testMode');
            const savedShiftPreference = localStorage.getItem('shiftSelector_shiftPreference');
            const savedMultipleShifts = localStorage.getItem('shiftSelector_multipleShifts');
            const savedMaxShifts = localStorage.getItem('shiftSelector_maxShifts');

            if (savedRefresh !== null) autoRefreshEnabled = savedRefresh === 'true';
            if (savedDay !== null) targetDay = parseInt(savedDay);
            if (savedTimeFrames !== null) {
                const [start, end] = savedTimeFrames.split('-');
                startTime = start;
                endTime = end;
            }
            if (savedAutoAdd !== null) autoAddShiftsEnabled = savedAutoAdd === 'true';
            if (savedTestMode !== null) testModeEnabled = savedTestMode === 'true';
            if (savedShiftPreference !== null) shiftPreference = savedShiftPreference;
            if (savedMultipleShifts !== null) multipleShiftsEnabled = savedMultipleShifts === 'true';
            if (savedMaxShifts !== null) maxShifts = parseInt(savedMaxShifts);
        } catch (err) {
            console.log('Error loading preferences:', err);
        }
    }

    // Save preferences to localStorage
    function savePreferences() {
        try {
            localStorage.setItem('shiftSelector_autoRefresh', autoRefreshEnabled.toString());
            localStorage.setItem('shiftSelector_targetDay', targetDay.toString());
            localStorage.setItem('shiftSelector_timeFrames', `${startTime}-${endTime}`);
            localStorage.setItem('shiftSelector_autoAdd', autoAddShiftsEnabled.toString());
            localStorage.setItem('shiftSelector_testMode', testModeEnabled.toString());
            localStorage.setItem('shiftSelector_shiftPreference', shiftPreference);
            localStorage.setItem('shiftSelector_multipleShifts', multipleShiftsEnabled.toString());
            localStorage.setItem('shiftSelector_maxShifts', maxShifts.toString());
        } catch (err) {
            console.log('Error saving preferences:', err);
        }
    }

    // Get random interval between 15-20s
    function getRandomInterval() {
        return Math.floor(Math.random() * 5000) + 15000;
    }

    // Check if URL date matches target day
    function isTargetDayFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const dateStr = params.get("date");
        if (!dateStr) return false;
        const date = new Date(dateStr);
        return date.getUTCDay() === targetDay;
    }

        // Check if the currently displayed day matches the target day
    function isCurrentDisplayedDayTarget() {
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const targetDayName = dayNames[targetDay];

        // Look for the currently selected day card using multiple indicators
        let selectedDayCard = document.querySelector('[data-test-id="day-card"][aria-label*="selected"]');

        // If not found by aria-label, try by CSS class (the selected card has css-1csuo9h)
        if (!selectedDayCard) {
            selectedDayCard = document.querySelector('[data-test-id="day-card"].css-1csuo9h');
        }

        // If still not found, try by tabindex (selected cards have tabindex="0", others have tabindex="-1")
        if (!selectedDayCard) {
            selectedDayCard = document.querySelector('[data-test-id="day-card"][tabindex="0"]');
        }

        if (!selectedDayCard) {
            console.log(`⚠️ Could not identify currently selected day card`);
            return false;
        }

        const weekdayText = selectedDayCard.querySelector('[data-testid="DateText-WeekdayLong"]');
        if (!weekdayText) return false;

        const currentDayName = weekdayText.innerText.trim();
        const isTarget = currentDayName === targetDayName;

        console.log(`🔍 Current day: ${currentDayName}, Target day: ${targetDayName}, Match: ${isTarget}`);
        return isTarget;
    }

    // Automatically switch to target day if needed
    function ensureTargetDayIsSelected() {
        if (isCurrentDisplayedDayTarget()) {
            console.log(`✅ Already on target day: ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][targetDay]}`);
            return true;
        }

        console.log(`🔄 Current day doesn't match target day, switching...`);

        // Try to find and click the target day
        if (clickDayCard(targetDay)) {
            // Wait a bit for the page to update, then check again
            setTimeout(() => {
                if (isCurrentDisplayedDayTarget()) {
                    console.log(`✅ Successfully switched to target day`);
                } else {
                    console.log(`⚠️ Failed to switch to target day, will retry on next check`);
                }
            }, 1000);
            return false;
        }

        // If we couldn't find the day, try scrolling to find it
        console.log(`🔄 Target day not found, attempting to scroll through day selector...`);
        scrollToFindTargetDay();

        return false;
    }

    // Scroll through day selector to find target day
    function scrollToFindTargetDay() {
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const targetDayName = dayNames[targetDay];

        const leftChevron = document.querySelector('[data-test-id="left-chevron"]');
        const rightChevron = document.querySelector('[data-test-id="right-chevron"]');

        if (!leftChevron || !rightChevron) {
            console.log(`⚠️ Could not find scroll buttons`);
            return;
        }

        let scrollAttempts = 0;
        const maxScrollAttempts = 10; // Prevent infinite scrolling

        const attemptScroll = (direction) => {
            if (scrollAttempts >= maxScrollAttempts) {
                console.log(`⚠️ Max scroll attempts reached, could not find ${targetDayName}`);
                return;
            }

            scrollAttempts++;
            console.log(`🔄 Scroll attempt ${scrollAttempts}: scrolling ${direction}`);

            // Click the appropriate chevron
            if (direction === 'left') {
                leftChevron.click();
            } else {
                rightChevron.click();
            }

            // Wait a bit for the scroll to complete, then check if we can find the target day
            setTimeout(() => {
                if (clickDayCard(targetDay)) {
                    console.log(`✅ Found ${targetDayName} after scrolling ${direction}`);
                } else {
                    // Try scrolling in the same direction again
                    setTimeout(() => attemptScroll(direction), 500);
                }
            }, 500);
        };

        // Start by trying to scroll right (forward in time)
        attemptScroll('right');
    }

    // Click "Stay Logged In" if modal appears
    function handleStayLoggedIn() {
        const modalBtn = Array.from(document.querySelectorAll('button, input[type="button"], [role="button"]'))
            .find(el => /stay logged in/i.test(el.innerText || el.value || ""));
        if (modalBtn) {
            console.log("👉 Clicking 'Stay Logged In'");
            modalBtn.click();
        }
    }

    // Play beep sound
    function playBeep() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = ctx.createOscillator();
            oscillator.type = "sine";
            oscillator.frequency.setValueAtTime(880, ctx.currentTime);
            oscillator.connect(ctx.destination);
            oscillator.start();
            oscillator.stop(ctx.currentTime + 0.5);
        } catch (err) {
            console.log("Audio not supported:", err);
        }
    }

    // Show desktop notification
    function notifyUser(shiftText) {
        if (Notification.permission === "granted") {
            new Notification("✅ Shift Grabbed!", {
                body: "Successfully picked up " + shiftText,
                icon: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Amazon_logo.svg/2560px-Amazon_logo.svg.png"
            });
        } else {
            Notification.requestPermission();
        }
    }

    // Wait for an element to appear within a timeout
    function waitForElement(selector, timeoutMs = 8000) {
        return new Promise((resolve, reject) => {
            const start = Date.now();

            const check = () => {
                const el = document.querySelector(selector);
                if (el) return resolve(el);
                if (Date.now() - start >= timeoutMs) return reject(new Error(`Timeout waiting for selector: ${selector}`));
                requestAnimationFrame(check);
            };

            check();
        });
    }

    // Wait for the success modal and dismiss it (click Done or Close)
    async function waitForAndDismissSuccessModal(timeoutMs = 8000) {
        try {
            // Wait for the modal content to be present
            await waitForElement('[data-test-id="AddOpportunityModalSuccess"]', timeoutMs);

            // Prefer the Done button if available
            const doneBtn = document.querySelector('[data-test-id="AddOpportunityModalSuccessDoneButton"]');
            if (doneBtn) {
                console.log('👉 Clicking Done on success modal');
                doneBtn.click();
            } else {
                const closeBtn = document.querySelector('[data-test-component="ModalCloseButton"]');
                if (closeBtn) {
                    console.log('👉 Clicking Close on success modal');
                    closeBtn.click();
                }
            }

            // Wait for the modal to disappear
            const start = Date.now();
            while (document.querySelector('[data-test-id="AddOpportunityModalSuccess"]')) {
                if (Date.now() - start > timeoutMs) break;
                await new Promise(r => setTimeout(r, 50));
            }
            console.log('✅ Success modal dismissed');
        } catch (err) {
            // Modal might not show or timed out; continue
            console.log('ℹ️ No success modal detected or timeout dismissing modal:', err.message || err);
        }
    }

    // Highlight shift card for test mode
    function highlightShift(card, shiftText) {
        card.style.outline = '3px solid #ff6b6b';
        card.style.outlineOffset = '2px';
        card.style.backgroundColor = '#fff3cd';

        setTimeout(() => {
            card.style.outline = '2px solid #ffc107';
            card.style.outlineOffset = '1px';
            card.style.backgroundColor = '#fff8e1';
        }, 1000);

        setTimeout(() => {
            card.style.outline = '';
            card.style.outlineOffset = '';
            card.style.backgroundColor = '';
        }, 5000);

        console.log(`🔍 TEST MODE: Highlighted shift "${shiftText}"`);
    }

    // Parse time string to minutes (handles AM/PM)
    function parseTimeToMinutes(timeStr) {
        let hour = parseInt(timeStr.split(':')[0]);
        let minute = parseInt(timeStr.split(':')[1]);

        if (timeStr.toLowerCase().includes('pm') && hour !== 12) hour += 12;
        if (timeStr.toLowerCase().includes('am') && hour === 12) hour = 0;

        return hour * 60 + minute;
    }

    // Check if two shifts overlap
    function shiftsOverlap(shift1, shift2) {
        // Check if shifts overlap (one starts before another ends and ends after another starts)
        // Edge case: shifts that touch exactly (e.g., 12-4pm and 4-8pm) are considered non-overlapping
        return (shift1.startMinutes < shift2.endMinutes && shift1.endMinutes > shift2.startMinutes);
    }

        // Filter out overlapping shifts from a list
    function filterNonOverlappingShifts(shifts) {
        if (shifts.length <= 1) return shifts;

        console.log(`🔍 Filtering ${shifts.length} shifts for overlaps...`);
        const nonOverlapping = [shifts[0]]; // Start with first shift
        console.log(`✅ Starting with first shift: ${shifts[0].shiftText}`);

        for (let i = 1; i < shifts.length; i++) {
            const currentShift = shifts[i];
            let hasOverlap = false;

            // Check if current shift overlaps with any already selected shift
            for (let j = 0; j < nonOverlapping.length; j++) {
                if (shiftsOverlap(currentShift, nonOverlapping[j])) {
                    console.log(`⚠️ Skipping overlapping shift: ${currentShift.shiftText} (${currentShift.startMinutes}-${currentShift.endMinutes}) overlaps with ${nonOverlapping[j].shiftText} (${nonOverlapping[j].startMinutes}-${nonOverlapping[j].endMinutes})`);
                    hasOverlap = true;
                    break;
                }
            }

            if (!hasOverlap) {
                nonOverlapping.push(currentShift);
                console.log(`✅ Added non-overlapping shift: ${currentShift.shiftText} (${currentShift.startMinutes}-${currentShift.endMinutes})`);
            }
        }

        console.log(`🎯 Final result: ${nonOverlapping.length} non-overlapping shifts out of ${shifts.length} total`);
        return nonOverlapping;
    }

        // Main shift detection logic
    async function checkForShifts() {
        console.log('🔍 Checking for shifts');
        handleStayLoggedIn();

        if (!isTargetDayFromUrl()) {
            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            console.log(`⛔ Not ${dayNames[targetDay]}, skipping claim logic`);
            return;
        }

        const shiftCards = document.querySelectorAll('[data-testid^="OpportunityCard"]');
        console.log(`🔍 Found ${shiftCards.length} shift cards`);

        // Collect all matching shifts
        const matchingShifts = [];

        shiftCards.forEach(card => {
            const shiftTextEl = card.querySelector('[data-test-id="ShiftInfo"] strong');
            if (!shiftTextEl) return;

            const shiftText = shiftTextEl.innerText.trim();
            const [shiftStart, shiftEnd] = shiftText.split('-').map(t => t.trim());

            const shiftStartMinutes = parseTimeToMinutes(shiftStart);
            const shiftEndMinutes = parseTimeToMinutes(shiftEnd);
            const targetStartMinutes = parseInt(startTime.split(':')[0]) * 60 + parseInt(startTime.split(':')[1]);
            const targetEndMinutes = parseInt(endTime.split(':')[0]) * 60 + parseInt(endTime.split(':')[1]);

            const isCompletelyWithin = shiftStartMinutes >= targetStartMinutes && shiftEndMinutes <= targetEndMinutes;
            const startsWithinRange = shiftStartMinutes >= targetStartMinutes && shiftStartMinutes < targetEndMinutes;

            if (isCompletelyWithin || startsWithinRange) {
                const matchType = isCompletelyWithin ? "completely within" : "starts within";
                console.log(`✅ Target shift found (${matchType} target range):`, shiftText);

                const addButton = card.querySelector('button[data-test-id="AddOpportunityModalButton"]');
                if (addButton) {
                    matchingShifts.push({
                        card: card,
                        shiftText: shiftText,
                        startMinutes: shiftStartMinutes,
                        endMinutes: shiftEndMinutes,
                        addButton: addButton,
                        matchType: matchType
                    });
                }
            }
        });

                // Process matching shifts based on preference
        if (matchingShifts.length > 0) {
            console.log(`🎯 Found ${matchingShifts.length} matching shifts`);

            // Sort shifts based on preference
            if (shiftPreference === "earliest") {
                matchingShifts.sort((a, b) => a.startMinutes - b.startMinutes);
                console.log(`⏰ Preferring earliest shifts first`);
            } else {
                matchingShifts.sort((a, b) => b.startMinutes - a.startMinutes);
                console.log(`⏰ Preferring latest shifts first`);
            }

            if (multipleShiftsEnabled && matchingShifts.length > 1) {
                // Filter out overlapping shifts first to prevent scheduling conflicts
                // This ensures shifts like 12-4pm and 4-8pm work, but 12-4pm and 3-7pm don't
                const nonOverlappingShifts = filterNonOverlappingShifts(matchingShifts);
                console.log(`🔄 Found ${nonOverlappingShifts.length} non-overlapping shifts out of ${matchingShifts.length} total`);

                // Handle multiple shifts (limited by maxShifts)
                const shiftsToProcess = Math.min(nonOverlappingShifts.length, maxShifts);
                console.log(`🔄 Processing ${shiftsToProcess} shifts (multiple shifts enabled)`);

                let processedCount = 0;

                for (let i = 0; i < shiftsToProcess; i++) {
                    if (testModeEnabled) {
                        highlightShift(nonOverlappingShifts[i].card, nonOverlappingShifts[i].shiftText);
                        processedCount++;
                    } else if (autoAddShiftsEnabled) {
                        try {
                            console.log(`👉 Auto-adding shift ${i + 1}/${shiftsToProcess}:`, nonOverlappingShifts[i].shiftText);

                            // 🔑 Re-query DOM for the current shift's button by its text
                            const freshCard = Array.from(document.querySelectorAll('[data-testid^="OpportunityCard"]'))
                                .find(card => (card.innerText || "").includes(nonOverlappingShifts[i].shiftText));
                            const freshBtn = freshCard?.querySelector('button[data-test-id="AddOpportunityModalButton"]');

                            if (!freshBtn) {
                                console.log(`⚠️ Could not find fresh button for ${nonOverlappingShifts[i].shiftText}, skipping`);
                                continue;
                            }

                            freshBtn.click();
                            await waitForAndDismissSuccessModal();
                            processedCount++;

                            // Small delay between clicks to avoid overwhelming the system
                            if (i < shiftsToProcess - 1) {
                                await new Promise(resolve => setTimeout(resolve, 1000));
                            }
                        } catch (err) {
                            console.log(`❌ Error adding shift ${i + 1}:`, err);
                        }
                    }
                }

                if (processedCount > 0) {
                    playBeep();
                    const overlapCount = matchingShifts.length - nonOverlappingShifts.length;
                    if (overlapCount > 0) {
                        notifyUser(`Successfully processed ${processedCount} shifts (${overlapCount} overlapping shifts filtered out)`);
                    } else {
                        notifyUser(`Successfully processed ${processedCount} shifts`);
                    }
                } else if (nonOverlappingShifts.length === 0 && matchingShifts.length > 1) {
                    console.log(`⚠️ All shifts had overlaps - none could be processed`);
                }
            } else {
                // Handle single shift (original behavior)
                const selectedShift = matchingShifts[0];

                if (testModeEnabled) {
                    highlightShift(selectedShift.card, selectedShift.shiftText);
                } else if (autoAddShiftsEnabled) {
                    console.log(`👉 Auto-adding ${shiftPreference} shift:`, selectedShift.shiftText);
                    selectedShift.addButton.click();

                    // Wait for success modal and dismiss it to continue
                    await waitForAndDismissSuccessModal();

                    playBeep();
                    notifyUser(selectedShift.shiftText);
                } else {
                    console.log(`🔍 ${shiftPreference.charAt(0).toUpperCase() + shiftPreference.slice(1)} shift found but auto-add is OFF:`, selectedShift.shiftText);
                }
            }
        } else {
            console.log("❌ No matching shifts found");
        }
    }

    // Auto-refresh loop
    function autoRefreshLoop() {
        if (autoRefreshEnabled) {
            console.log("⏳ Refreshing page...");
            location.reload();
        }
        setTimeout(autoRefreshLoop, getRandomInterval());
    }

    // Periodic check to ensure correct day is selected
    function periodicDayCheck() {
        try {
            if (!isCurrentDisplayedDayTarget()) {
                console.log(`🔄 Periodic check: Wrong day detected, switching to target day...`);
                ensureTargetDayIsSelected();
            }
        } catch (e) {
            console.log('⚠️ periodicDayCheck error:', e);
        }
        setTimeout(periodicDayCheck, 30000);
    }

    // Update button colors based on state
    function updateButtonColors(btn, buttonType) {
        const colors = {
            refresh: {
                on: { bg: '#4CAF50', border: '#45a049' },
                off: { bg: '#f44336', border: '#da190b' }
            },
            autoAdd: {
                on: { bg: '#4CAF50', border: '#45a049' },
                off: { bg: '#f44336', border: '#da190b' }
            },
            testMode: {
                on: { bg: '#FF9800', border: '#F57C00' },
                off: { bg: '#9E9E9E', border: '#757575' }
            },
            multipleShifts: {
                on: { bg: '#9C27B0', border: '#7B1FA2' },
                off: { bg: '#9E9E9E', border: '#757575' }
            }
        };

                const isEnabled = buttonType === 'refresh' ? autoRefreshEnabled :
                         buttonType === 'autoAdd' ? autoAddShiftsEnabled :
                         buttonType === 'testMode' ? testModeEnabled :
                         buttonType === 'multipleShifts' ? multipleShiftsEnabled :
                         false;

        const colorSet = colors[buttonType][isEnabled ? 'on' : 'off'];
        btn.style.backgroundColor = colorSet.bg;
        btn.style.color = 'white';
        btn.style.border = `2px solid ${colorSet.border}`;
    }

    // Click day card for selected day
    function clickDayCard(dayIndex) {
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const targetDayName = dayNames[dayIndex];

        console.log(`🔍 Looking for day card: ${targetDayName}`);

        // First try to find by weekday text
        const dayCards = document.querySelectorAll('[data-test-id="day-card"]');
        for (let card of dayCards) {
            const weekdayText = card.querySelector('[data-testid="DateText-WeekdayLong"]');
            if (weekdayText && weekdayText.innerText === targetDayName) {
                console.log(`🔄 Clicking day card for ${targetDayName}`);

                // Check if this card is already selected
                const isSelected = card.getAttribute('aria-label')?.includes('selected') ||
                                 card.classList.contains('css-1csuo9h');

                if (isSelected) {
                    console.log(`✅ ${targetDayName} is already selected`);
                    return true;
                }

                // Click the card
                card.click();
                return true;
            }
        }

        console.log(`⚠️ Could not find day card for ${targetDayName}`);
        return false;
    }

    // Create control button
    function createControlButton(text, initialState, onClick) {
        const btn = document.createElement('button');
        btn.innerText = text;
        btn.style.cssText = 'padding: 8px 12px; font-size: 12px; cursor: pointer; border-radius: 4px; font-weight: bold; transition: all 0.3s ease;';
        btn.onclick = onClick;
        return btn;
    }

    // Add controls to header
    function addControls() {
        const header = document.querySelector('header');
        if (!header) return;

        const controlsContainer = document.createElement('div');
        controlsContainer.style.cssText = 'display: flex; align-items: center; gap: 10px; margin-left: 10px;';

        // Auto refresh button
        const refreshBtn = createControlButton(
            'Auto Refresh: ' + (autoRefreshEnabled ? 'ON' : 'OFF'),
            autoRefreshEnabled,
            () => {
                autoRefreshEnabled = !autoRefreshEnabled;
                refreshBtn.innerText = 'Auto Refresh: ' + (autoRefreshEnabled ? 'ON' : 'OFF');
                updateButtonColors(refreshBtn, 'refresh');
                savePreferences();
            }
        );

        // Auto-add button
        const autoAddBtn = createControlButton(
            'Auto Add: ' + (autoAddShiftsEnabled ? 'ON' : 'OFF'),
            autoAddShiftsEnabled,
            () => {
                autoAddShiftsEnabled = !autoAddShiftsEnabled;
                autoAddBtn.innerText = 'Auto Add: ' + (autoAddShiftsEnabled ? 'ON' : 'OFF');
                updateButtonColors(autoAddBtn, 'autoAdd');
                savePreferences();
            }
        );

        // Test mode button
        const testModeBtn = createControlButton(
            'Test Mode: ' + (testModeEnabled ? 'ON' : 'OFF'),
            testModeEnabled,
            () => {
                testModeEnabled = !testModeEnabled;
                testModeBtn.innerText = 'Test Mode: ' + (testModeEnabled ? 'ON' : 'OFF');
                updateButtonColors(testModeBtn, 'testMode');
                savePreferences();
            }
        );

        // Shift preference selector
        const preferenceLabel = document.createElement('span');
        preferenceLabel.innerText = 'Shift Preference:';
        preferenceLabel.style.cssText = 'font-size: 12px; color: #666;';

        const preferenceSelect = document.createElement('select');
        preferenceSelect.style.cssText = 'padding: 6px; font-size: 12px; border-radius: 4px; border: 1px solid #ccc;';

        const preferences = [
            { value: 'earliest', name: 'Earliest' },
            { value: 'latest', name: 'Latest' }
        ];

        preferences.forEach(pref => {
            const option = document.createElement('option');
            option.value = pref.value;
            option.text = pref.name;
            if (pref.value === shiftPreference) option.selected = true;
            preferenceSelect.appendChild(option);
        });

        preferenceSelect.onchange = () => {
            shiftPreference = preferenceSelect.value;
            console.log(`🎯 Shift preference changed to: ${shiftPreference}`);
            savePreferences();
        };

        // Multiple shifts toggle button
        const multipleShiftsBtn = createControlButton(
            'Multiple Shifts: ' + (multipleShiftsEnabled ? 'ON' : 'OFF'),
            multipleShiftsEnabled,
            () => {
                multipleShiftsEnabled = !multipleShiftsEnabled;
                multipleShiftsBtn.innerText = 'Multiple Shifts: ' + (multipleShiftsEnabled ? 'ON' : 'OFF');
                updateButtonColors(multipleShiftsBtn, 'multipleShifts');
                savePreferences();
            }
        );

        // Max shifts input
        const maxShiftsLabel = document.createElement('span');
        maxShiftsLabel.innerText = 'Max Shifts:';
        maxShiftsLabel.style.cssText = 'font-size: 12px; color: #666;';

        const maxShiftsInput = document.createElement('input');
        maxShiftsInput.type = 'number';
        maxShiftsInput.min = '1';
        maxShiftsInput.max = '10';
        maxShiftsInput.value = maxShifts;
        maxShiftsInput.style.cssText = 'padding: 6px; font-size: 12px; border-radius: 4px; border: 1px solid #ccc; width: 60px;';

        maxShiftsInput.onchange = () => {
            maxShifts = parseInt(maxShiftsInput.value) || 3;
            console.log(`🎯 Max shifts changed to: ${maxShifts}`);
            savePreferences();
        };

        // Day selector
        const dayLabel = document.createElement('span');
        dayLabel.innerText = 'Target Day:';
        dayLabel.style.cssText = 'font-size: 12px; color: #666;';

        const daySelect = document.createElement('select');
        daySelect.style.cssText = 'padding: 6px; font-size: 12px; border-radius: 4px; border: 1px solid #ccc;';

        const days = [
            { value: 0, name: 'Sunday' },
            { value: 1, name: 'Monday' },
            { value: 2, name: 'Tuesday' },
            { value: 3, name: 'Wednesday' },
            { value: 4, name: 'Thursday' },
            { value: 5, name: 'Friday' },
            { value: 6, name: 'Saturday' }
        ];

        days.forEach(day => {
            const option = document.createElement('option');
            option.value = day.value;
            option.text = day.name;
            if (day.value === targetDay) option.selected = true;
            daySelect.appendChild(option);
        });

        daySelect.onchange = () => {
            targetDay = parseInt(daySelect.value);
            console.log(`🎯 Target day changed to: ${days[targetDay].name}`);
            clickDayCard(targetDay);
            savePreferences();
        };

        // Time frame selector
        const timeLabel = document.createElement('span');
        timeLabel.innerText = 'Target Times:';
        timeLabel.style.cssText = 'font-size: 12px; color: #666;';

        const startTimeInput = document.createElement('input');
        startTimeInput.type = 'time';
        startTimeInput.value = startTime;
        startTimeInput.style.cssText = 'padding: 6px; font-size: 12px; border-radius: 4px; border: 1px solid #ccc; min-width: 100px;';

        const endTimeInput = document.createElement('input');
        endTimeInput.type = 'time';
        endTimeInput.value = endTime;
        endTimeInput.style.cssText = 'padding: 6px; font-size: 12px; border-radius: 4px; border: 1px solid #ccc; min-width: 100px;';

        const timeSelectContainer = document.createElement('div');
        timeSelectContainer.style.cssText = 'display: flex; align-items: center; gap: 5px;';
        timeSelectContainer.appendChild(startTimeInput);
        timeSelectContainer.appendChild(document.createTextNode(' - '));
        timeSelectContainer.appendChild(endTimeInput);

        const updateWarningText = () => {
            if (!startTime || !endTime) {
                warningText.innerHTML = '<small style="color: #ff6b6b; font-size: 10px; margin-top: 2px;">⚠️ Select at least one time frame for shift detection</small>';
            } else {
                warningText.innerHTML = `<small style="color: #4CAF50; font-size: 10px; margin-top: 2px;">✅ Targeting ${startTime}-${endTime}</small>`;
            }
        };

        timeSelectContainer.onchange = () => {
            startTime = startTimeInput.value;
            endTime = endTimeInput.value;
            console.log(`⏰ Target time frames updated: Start=${startTime}, End=${endTime}`);
            savePreferences();
            updateWarningText();
        };

        // Warning text
        const warningText = document.createElement('div');
        warningText.style.marginLeft = '10px';

        // Add all controls
        controlsContainer.appendChild(refreshBtn);
        controlsContainer.appendChild(autoAddBtn);
        controlsContainer.appendChild(testModeBtn);
        controlsContainer.appendChild(preferenceLabel);
        controlsContainer.appendChild(preferenceSelect);
        controlsContainer.appendChild(multipleShiftsBtn);
        controlsContainer.appendChild(maxShiftsLabel);
        controlsContainer.appendChild(maxShiftsInput);
        controlsContainer.appendChild(dayLabel);
        controlsContainer.appendChild(daySelect);
        controlsContainer.appendChild(timeLabel);
        controlsContainer.appendChild(timeSelectContainer);
        controlsContainer.appendChild(warningText);

        // Add instruction text
        const instructionText = document.createElement('div');
        instructionText.innerHTML = '<small style="color: #888; font-size: 10px; margin-top: 2px;">⏰ Select start and end time for shift detection | 🔄 Multiple shifts automatically filters out overlapping times</small>';
        instructionText.style.marginLeft = '10px';
        controlsContainer.appendChild(instructionText);

        header.appendChild(controlsContainer);

        // Set initial button colors
        updateButtonColors(refreshBtn, 'refresh');
        updateButtonColors(autoAddBtn, 'autoAdd');
        updateButtonColors(testModeBtn, 'testMode');
        updateButtonColors(multipleShiftsBtn, 'multipleShifts');
        updateWarningText();
    }

    // Initialize script
    loadPreferences();
    setTimeout(() => {
        console.log("🔍 Starting script");
        checkForShifts();
        addControls();
        setInterval(handleStayLoggedIn, 2000);
        setTimeout(autoRefreshLoop, getRandomInterval());
        // Start periodic day check to keep the correct day selected
        periodicDayCheck();

    }, 2000);

})();