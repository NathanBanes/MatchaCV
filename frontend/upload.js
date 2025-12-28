// Upload page functionality
document.addEventListener('DOMContentLoaded', function() {
    // Helper function to get API base URL (works for both localhost and production)
    const getApiUrl = () => {
        // Use config function if available (from config.js)
        if (typeof window.getApiUrl === 'function') {
            return window.getApiUrl();
        }
        // Fallback to current origin
        return window.location.origin;
    };
    
    const uploadForm = document.getElementById('uploadForm');
    const resumeFileInput = document.getElementById('resumeFile');
    const fileNameDisplay = document.getElementById('fileNameDisplay');
    const jobUrlRadio = document.getElementById('jobUrl');
    const jobPasteRadio = document.getElementById('jobPaste');
    const urlInputWrapper = document.getElementById('urlInputWrapper');
    const pasteInputWrapper = document.getElementById('pasteInputWrapper');
    const jobUrlInput = document.getElementById('jobUrlInput');
    const jobPasteInput = document.getElementById('jobPasteInput');
    const submitBtn = document.getElementById('submitBtn');
    
    // CRITICAL: Disable ALL browser validation immediately
    if (uploadForm) {
        uploadForm.setAttribute('novalidate', '');
        uploadForm.noValidate = true;
        // Override checkValidity to always return true
        uploadForm.checkValidity = function() { return true; };
        // Prevent invalid event from bubbling
        uploadForm.addEventListener('invalid', function(e) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            return false;
        }, true);
    }
    if (jobUrlInput) {
        jobUrlInput.removeAttribute('required');
        jobUrlInput.removeAttribute('pattern');
        jobUrlInput.required = false;
        jobUrlInput.setCustomValidity('');
        jobUrlInput.checkValidity = function() { return true; };
        jobUrlInput.addEventListener('invalid', function(e) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            return false;
        }, true);
    }
    if (jobPasteInput) {
        jobPasteInput.removeAttribute('required');
        jobPasteInput.removeAttribute('pattern');
        jobPasteInput.required = false;
        jobPasteInput.setCustomValidity('');
        jobPasteInput.checkValidity = function() { return true; };
        jobPasteInput.addEventListener('invalid', function(e) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            return false;
        }, true);
    }
    if (resumeFileInput) {
        resumeFileInput.removeAttribute('required');
        resumeFileInput.required = false;
        resumeFileInput.setCustomValidity('');
        resumeFileInput.checkValidity = function() { return true; };
        resumeFileInput.addEventListener('invalid', function(e) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            return false;
        }, true);
    }

    // Toggle between URL and paste text options
    if (jobUrlRadio && jobPasteRadio) {
        jobUrlRadio.addEventListener('change', function() {
            if (this.checked) {
                urlInputWrapper.style.display = 'block';
                pasteInputWrapper.style.display = 'none';
                // Don't set required - we handle validation in JavaScript
                jobPasteInput.value = ''; // Clear paste input
            }
        });

        jobPasteRadio.addEventListener('change', function() {
            if (this.checked) {
                urlInputWrapper.style.display = 'none';
                pasteInputWrapper.style.display = 'block';
                // Don't set required - we handle validation in JavaScript
                jobUrlInput.value = ''; // Clear URL input
            }
        });
    }

    // Handle file upload and display file name
    if (resumeFileInput && fileNameDisplay) {
        resumeFileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                const fileName = file.name;
                const fileSize = (file.size / 1024).toFixed(2); // Size in KB
                fileNameDisplay.textContent = `Selected: ${fileName} (${fileSize} KB)`;
                fileNameDisplay.classList.add('show');
            } else {
                fileNameDisplay.classList.remove('show');
            }
        });
    }

    // Form submission handler - use button click instead of form submit to bypass validation
    async function handleFormSubmit(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        // Basic validation
            const file = resumeFileInput.files[0];
            if (!file) {
                showError('Please select a resume file.');
                return;
            }

            const isUrlSelected = jobUrlRadio.checked;
            const urlValue = jobUrlInput.value.trim();
            const pasteValue = jobPasteInput.value.trim();

            if (isUrlSelected && !urlValue) {
                showError('Please enter a job posting URL.');
                return;
            }

            // Validate and normalize URL format if URL is selected
            if (isUrlSelected && urlValue) {
                let normalizedUrl = urlValue.trim();
                
                // Auto-add https:// if missing
                if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
                    normalizedUrl = 'https://' + normalizedUrl;
                    jobUrlInput.value = normalizedUrl; // Update the input field
                }
                
                // Validate URL format
                try {
                    const url = new URL(normalizedUrl);
                    if (!url.protocol.startsWith('http')) {
                        showError('Please enter a valid URL starting with http:// or https://');
                        return;
                    }
                } catch (e) {
                    showError('Please enter a valid URL (e.g., https://example.com/job-posting)');
                    return;
                }
            }

            if (!isUrlSelected && !pasteValue) {
                showError('Please paste the job posting text.');
                return;
            }

            // Hide previous results/errors
            hideResults();
            hideError();
            
            // Show loading state
            showLoading();
            
            // Prepare form data
            const formData = new FormData();
            formData.append('resumeFile', file);
            formData.append('jobPostingType', isUrlSelected ? 'url' : 'paste');
            if (isUrlSelected) {
                formData.append('jobUrl', urlValue);
            } else {
                formData.append('jobPaste', pasteValue);
            }

            try {
                // Call API to upload and get jobId
                const apiUrl = getApiUrl();
                console.log('Calling API:', `${apiUrl}/api/analyze`);
                
                const response = await fetch(`${apiUrl}/api/analyze`, {
                    method: 'POST',
                    body: formData,
                    mode: 'cors',
                    credentials: 'omit'
                });

                const data = await response.json();
                
                // Log the response for debugging
                console.log('Server response:', data);
                
                // Check if response is an error (even if status is 200)
                if (!response.ok || data.error) {
                    const errorMessage = data.error || data.message || `Server error: ${response.status} ${response.statusText}`;
                    throw new Error(errorMessage);
                }
                
                // Check if this is async response (has jobId) or sync response (has score directly)
                if (data.jobId) {
                    // Async response - connect to WebSocket
                    updateLoadingMessage('Analyzing Resume');
                    connectToWebSocket(data.jobId);
                } else if (data.score && data.suggestions) {
                    // Sync response - display results directly
                    console.log('Received synchronous response, displaying results directly');
                    hideLoading();
                    displayResults(data);
                } else {
                    // Unexpected response format
                    if (data.error || data.message) {
                        throw new Error(data.error || data.message || 'Unexpected server response format');
                    }
                    throw new Error('Unexpected server response format. Server response: ' + JSON.stringify(data));
                }

            } catch (error) {
                console.error('Analysis error:', error);
                hideLoading();
                
                // More specific error messages
                let errorMessage = error.message || 'Failed to analyze resume.';
                
                console.error('Analysis error details:', {
                    message: error.message,
                    name: error.name,
                    stack: error.stack
                });
                
                if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('Load failed')) {
                    errorMessage = 'Cannot connect to server. Please check:\n1. Backend is running on EC2\n2. Security group allows HTTP traffic\n3. Backend URL is correct: ' + getApiUrl();
                } else if (error.message.includes('CORS')) {
                    errorMessage = 'CORS error. Please check server CORS configuration allows requests from: ' + window.location.origin;
                }
                
                showError(errorMessage);
            }
    }
    
    // Completely disable browser validation
    if (uploadForm) {
        uploadForm.setAttribute('novalidate', '');
        uploadForm.noValidate = true;
        
        // Prevent any form submission validation
        uploadForm.addEventListener('submit', function(e) {
            e.preventDefault();
            e.stopPropagation();
            handleFormSubmit(e);
        }, false);
        
        // Prevent browser validation errors from showing
        uploadForm.addEventListener('invalid', function(e) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }, true);
    }
    
    // Attach handler to button click (bypasses form validation completely)
    if (submitBtn) {
        submitBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            // Clear any browser validation messages
            if (uploadForm) {
                uploadForm.checkValidity = function() { return true; };
            }
            handleFormSubmit(e);
        }, false);
    }
    
    // Remove any required attributes and disable validation on all inputs
    if (jobUrlInput) {
        jobUrlInput.removeAttribute('required');
        jobUrlInput.removeAttribute('pattern');
        jobUrlInput.required = false;
        jobUrlInput.setCustomValidity('');
        jobUrlInput.addEventListener('invalid', function(e) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }, true);
    }
    if (jobPasteInput) {
        jobPasteInput.removeAttribute('required');
        jobPasteInput.removeAttribute('pattern');
        jobPasteInput.required = false;
        jobPasteInput.setCustomValidity('');
        jobPasteInput.addEventListener('invalid', function(e) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }, true);
    }
    if (resumeFileInput) {
        resumeFileInput.removeAttribute('required');
        resumeFileInput.required = false;
        resumeFileInput.setCustomValidity('');
        resumeFileInput.addEventListener('invalid', function(e) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }, true);
    }

    // Helper functions
    function showLoading() {
        const loadingState = document.getElementById('loadingState');
        const submitBtn = document.getElementById('submitBtn');
        if (loadingState) loadingState.style.display = 'block';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Analyzing...';
        }
    }

    function hideLoading() {
        const loadingState = document.getElementById('loadingState');
        const submitBtn = document.getElementById('submitBtn');
        if (loadingState) loadingState.style.display = 'none';
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Analyze Resume';
        }
    }

    function updateLoadingMessage(message) {
        const loadingText = document.querySelector('#loadingState .loading-text');
        if (loadingText) {
            loadingText.textContent = message || 'Analyzing Resume';
        }
    }

    function showError(message) {
        const errorDisplay = document.getElementById('errorDisplay');
        const errorMessage = document.getElementById('errorMessage');
        if (errorDisplay) errorDisplay.style.display = 'block';
        if (errorMessage) errorMessage.textContent = message;
        
        // Scroll to error
        errorDisplay.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function hideError() {
        const errorDisplay = document.getElementById('errorDisplay');
        if (errorDisplay) errorDisplay.style.display = 'none';
    }

    function hideResults() {
        const resultsSection = document.getElementById('resultsSection');
        if (resultsSection) resultsSection.style.display = 'none';
    }

    function displayResults(data) {
        console.log('displayResults called with data:', data);
        const resultsSection = document.getElementById('resultsSection');
        if (!resultsSection) {
            console.error('Results section not found!');
            return;
        }

        // Handle different data formats
        // Data might come as: { score: {...}, suggestions: [...], keywordMatch: {...} }
        // Or as: { results: { score: {...}, suggestions: [...], keywordMatch: {...} } }
        let scoreObj = data.score || (data.results && data.results.score);
        let suggestions = data.suggestions || (data.results && data.results.suggestions);
        
        if (!scoreObj) {
            console.error('No score object found in data:', data);
            showError('Invalid results format received');
            return;
        }

        // Display score
        const score = Math.round(scoreObj.overallScore || scoreObj.overall_score || 0);
        const scoreValue = document.getElementById('scoreValue');
        const scoreDescription = document.getElementById('scoreDescription');
        
        if (scoreValue) {
            scoreValue.textContent = score + '%';
            // Update score circle color based on score
            const scoreCircle = scoreValue.closest('.score-circle');
            if (scoreCircle) {
                scoreCircle.className = 'score-circle';
                if (score >= 80) {
                    scoreCircle.classList.add('score-excellent');
                } else if (score >= 60) {
                    scoreCircle.classList.add('score-good');
                } else if (score >= 40) {
                    scoreCircle.classList.add('score-fair');
                } else {
                    scoreCircle.classList.add('score-poor');
                }
            }
        }

        if (scoreDescription) {
            if (score >= 80) {
                scoreDescription.textContent = 'Excellent match! Your resume has strong keyword alignment with the job description.';
            } else if (score >= 60) {
                scoreDescription.textContent = 'Good match. Your resume aligns well, but there\'s room for improvement.';
            } else if (score >= 40) {
                scoreDescription.textContent = 'Fair match. Consider adding more relevant keywords to improve your ATS score.';
            } else {
                scoreDescription.textContent = 'Low match. Your resume needs significant optimization to pass ATS screening.';
            }
        }

        // Display breakdown
        const breakdown = scoreObj.breakdown;
        if (breakdown) {
            updateBreakdown('technical', breakdown.technical);
            updateBreakdown('softSkills', breakdown.softSkills);
            updateBreakdown('education', breakdown.education);
        }

        // Display suggestions
        displaySuggestions(suggestions || []);

        // Show results section
        resultsSection.style.display = 'block';
        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function updateBreakdown(type, data) {
        const fill = document.getElementById(type + 'Fill');
        const text = document.getElementById(type + 'Text');
        
        if (fill) {
            const percentage = data.total > 0 ? (data.matched / data.total) * 100 : 0;
            fill.style.width = percentage + '%';
        }
        
        if (text) {
            text.textContent = `${data.matched} / ${data.total}`;
        }
    }

    function displaySuggestions(suggestions) {
        const suggestionsList = document.getElementById('suggestionsList');
        if (!suggestionsList) return;

        suggestionsList.innerHTML = '';

        if (suggestions.length === 0) {
            suggestionsList.innerHTML = '<div class="suggestion-item">No specific suggestions at this time. Your resume looks good!</div>';
            return;
        }

        suggestions.forEach(suggestion => {
            const suggestionDiv = document.createElement('div');
            suggestionDiv.className = `suggestion-item suggestion-${suggestion.priority}`;
            
            let itemsHTML = '';
            if (suggestion.items && suggestion.items.length > 0) {
                itemsHTML = '<ul class="suggestion-items">';
                suggestion.items.forEach(item => {
                    itemsHTML += `<li>${item}</li>`;
                });
                itemsHTML += '</ul>';
            }

            suggestionDiv.innerHTML = `
                <div class="suggestion-header">
                    <h4 class="suggestion-title">${suggestion.title}</h4>
                    <span class="suggestion-priority">${suggestion.priority}</span>
                </div>
                <p class="suggestion-description">${suggestion.description}</p>
                ${itemsHTML}
                <p class="suggestion-action">${suggestion.action}</p>
            `;

            suggestionsList.appendChild(suggestionDiv);
        });
    }

    // WebSocket connection and job status handling
    function connectToWebSocket(jobId) {
        const serverUrl = getApiUrl();
        
        // Always start polling as a backup, even if WebSocket connects
        startPolling(jobId);
        
        try {
            socket = io(serverUrl, {
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionAttempts: 5
            });

            socket.on('connect', () => {
                console.log('WebSocket: Connected');
                socket.emit('join:job', jobId);
                console.log('WebSocket: Joined room for job:', jobId);
            });

            socket.on('joined', (data) => {
                console.log('WebSocket: Joined room:', data.room);
            });

            socket.on('job:status', (data) => {
                console.log('WebSocket: Job status update:', data);
                if (data.message) {
                    updateLoadingMessage(data.message);
                }
            });

            socket.on('job:complete', (data) => {
                console.log('WebSocket: Job completed:', data);
                if (socket) {
                    socket.disconnect();
                    socket = null;
                }
                if (pollingInterval) {
                    clearInterval(pollingInterval);
                    pollingInterval = null;
                }
                hideLoading();
                if (data.results) {
                    displayResults(data.results);
                }
            });

            socket.on('job:error', (data) => {
                console.error('WebSocket: Job error:', data);
                if (socket) {
                    socket.disconnect();
                    socket = null;
                }
                if (pollingInterval) {
                    clearInterval(pollingInterval);
                    pollingInterval = null;
                }
                hideLoading();
                showError(data.error || 'Job processing failed');
            });

            socket.on('connect_error', (error) => {
                console.error('WebSocket: Connection error:', error);
                // Fallback to polling
                startPolling(jobId);
            });

            socket.on('disconnect', () => {
                console.log('WebSocket: Disconnected');
            });

        } catch (error) {
            console.error('WebSocket: Failed to connect:', error);
            // Fallback to polling
            startPolling(jobId);
        }
    }

    // Polling fallback if WebSocket fails
    function startPolling(jobId) {
        console.log('Starting polling for job:', jobId);
        updateLoadingMessage('Analyzing Resume');
        
        let pollCount = 0;
        const maxPolls = 60; // 60 polls * 1 second = 60 seconds max wait
        const pollInterval = 1000; // Poll every 1 second for faster updates
        
        pollingInterval = setInterval(async () => {
            pollCount++;
            
            // If job hasn't been processed after 30 seconds, fall back to sync processing
            if (pollCount > 30) { // 30 * 1 = 30 seconds
                console.warn('Job taking too long, falling back to sync processing');
                clearInterval(pollingInterval);
                pollingInterval = null;
                updateLoadingMessage('Processing synchronously...');
                
                // Try to get the job data and process it synchronously
                try {
                    const apiUrl = getApiUrl();
                    const jobResponse = await fetch(`${apiUrl}/api/job/${jobId}`);
                    if (jobResponse.ok) {
                        const jobData = await jobResponse.json();
                        // If job is still pending, trigger sync processing
                        if (jobData.status === 'pending' || jobData.status === 'processing') {
                            // Call sync endpoint with the same data
                            const syncResponse = await fetch(`${apiUrl}/api/analyze-sync`, {
                                method: 'POST',
                                body: new FormData(uploadForm)
                            });
                            
                            if (syncResponse.ok) {
                                const syncData = await syncResponse.json();
                                hideLoading();
                                displayResults(syncData);
                                return;
                            }
                        }
                    }
                } catch (syncError) {
                    console.error('Sync fallback error:', syncError);
                }
                
                hideLoading();
                showError('Job processing timed out. Please try again.');
                return;
            }
            
            try {
                const apiUrl = getApiUrl();
                const response = await fetch(`${apiUrl}/api/job/${jobId}`);
                if (!response.ok) {
                    throw new Error('Failed to get job status');
                }
                
                const jobData = await response.json();
                
                console.log(`Polling: Job ${jobId} status: ${jobData.status} (poll #${pollCount})`);
                
                if (jobData.status === 'completed') {
                    console.log(`Polling: Job completed! Fetching results...`);
                    // Get results
                    const resultsResponse = await fetch(`${apiUrl}/api/job/${jobId}/results`);
                    if (resultsResponse.ok) {
                        const resultsData = await resultsResponse.json();
                        console.log(`Polling: Results received, displaying...`);
                        clearInterval(pollingInterval);
                        pollingInterval = null;
                        if (socket) {
                            socket.disconnect();
                            socket = null;
                        }
                        hideLoading();
                        console.log('Polling: Results data from API:', resultsData);
                        displayResults({
                            success: true,
                            score: resultsData.score,
                            suggestions: resultsData.suggestions,
                            keywordMatch: resultsData.keywordMatch || resultsData.keywordMatches
                        });
                    } else {
                        console.error(`Polling: Failed to fetch results: ${resultsResponse.status}`);
                    }
                } else if (jobData.status === 'failed') {
                    clearInterval(pollingInterval);
                    pollingInterval = null;
                    hideLoading();
                    showError(jobData.errorMessage || 'Job processing failed');
                } else if (jobData.status === 'pending' || jobData.status === 'processing') {
                    // Update loading message based on status
                    if (jobData.status === 'processing' && jobData.message) {
                        updateLoadingMessage(jobData.message);
                    }
                }
            } catch (error) {
                console.error('Polling error:', error);
            }
        }, pollInterval);
    }
});

