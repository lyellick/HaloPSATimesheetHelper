document.addEventListener('DOMContentLoaded', function () {
    // Extract access token from the URL fragment
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');

    if (accessToken) {
        // Ensure chrome.runtime is available
        if (typeof chrome.runtime !== 'undefined') {
            chrome.runtime.sendMessage({ action: 'receiveToken', token: accessToken });

            chrome.tabs.getCurrent(function(tab) {
                chrome.tabs.remove(tab.id, function() { });
            });
        } else {
            console.error('chrome.runtime is not available');
        }
    } else {
        console.error('Access token not found in URL');
    }
});