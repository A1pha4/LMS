// navigation.js - Handles navigation active states across pages
document.addEventListener("DOMContentLoaded", function() {
    // Get current page filename
    const currentPage = window.location.pathname.split("/").pop();
    
    // Find the matching navigation link and add active class
    const navLinks = document.querySelectorAll(".leftbar a");
    navLinks.forEach(link => {
      const linkPage = link.getAttribute("href");
      
      // Add active class if the href matches the current page
      if (linkPage === currentPage) {
        link.classList.add("active");
      }
  
      // Special case for index/home page
      if (currentPage === "" || currentPage === "/" || currentPage === "index.html") {
        if (linkPage === "index.html" || linkPage === "./") {
          link.classList.add("active");
        }
      }
    });
  });