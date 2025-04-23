// Common functions used across multiple pages

// Check if user is logged in
function checkLogin() {
  const userId = localStorage.getItem("user_id");
  const token = localStorage.getItem("token");
  
  if (!userId || !token) {
    alert("Please log in first.");
    window.location.href = "library.html";
    return false;
  }
  return true;
}

// Show and hide sections
function showSection(sectionId) {
  try {
    // Hide all sections first
    const sections = document.querySelectorAll(".section");
    sections.forEach(section => {
      if (section) section.style.display = "none";
    });
    
    // Show the requested section if it exists
    const targetSection = document.getElementById(sectionId);
    if (!targetSection) {
      console.error(`Section with ID ${sectionId} not found`);
      return false;
    }
    
    targetSection.style.display = "block";
    return true;
  } catch (error) {
    console.error("Error in showSection:", error);
    return false;
  }

  
}

// HTML escape function for security
function escapeHtml(unsafe) {
  return unsafe ? unsafe.toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;") : '';
}