const express = require("express");
const mysql = require("mysql2");
const bodyParser = require("body-parser");
const cors = require("cors");
const port =5500;
require('dotenv').config()

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Connect to MySQL
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

db.connect(err => {
    if (err) {
        console.error("Database connection failed: " + err.message);
        return;
    }
    console.log("Connected to MySQL database");
});

// SIGNUP ROUTE
const bcrypt = require("bcrypt"); // Import bcrypt
const saltRounds = 10; // Number of salt rounds for hashing

app.post("/signup", (req, res) => {
    const { full_name, email, contact, user_password } = req.body;

    if (!full_name || !email || !contact || !user_password) {
        return res.status(400).send("All fields are required");
    }

    // Check if the email already exists
    const checkEmailSql = "SELECT * FROM accounts WHERE email = ?";
    db.query(checkEmailSql, [email], (err, result) => {
        if (err) return res.status(500).send("Database error: " + err.message);

        if (result.length > 0) {
            return res.status(400).send("Email already exists");
        }

        // Hash the password before storing
        bcrypt.hash(user_password, saltRounds, (err, hashedPassword) => {
            if (err) return res.status(500).send("Error hashing password");

            const insertUserSql = "INSERT INTO accounts (full_name, email, contact, user_password) VALUES (?, ?, ?, ?)";
            db.query(insertUserSql, [full_name, email, contact, hashedPassword], (err, result) => {
                if (err) return res.status(500).send("Database error: " + err.message);
                
                res.send({
                    message: "User registered successfully!",
                    success: true,
                    user_id: result.insertId  // Send the new user's ID
                });
            });
        });
    });
});


// LOGIN ROUTE
app.post("/login", (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).send("All fields are required");
    }

    const sql = "SELECT * FROM accounts WHERE email = ?";
    db.query(sql, [email], (err, result) => {
        if (err) return res.status(500).send("Internal Server Error");

        if (result.length === 0) {
            return res.status(401).send("Invalid email or password");
        }

        const user = result[0];
        bcrypt.compare(password, user.user_password, (err, isMatch) => {
            if (err) return res.status(500).send("Error checking password");
            
            if (!isMatch) {
                return res.status(401).send("Invalid email or password");
            }

            res.send({ message: "Login successful", success: true, user_id: user.user_id ,userEmail:email});
        });
    });
});

// Route to fetch user profile data
app.get("/profile/:email", (req, res) => {
    const email = req.params.email;

    const sql = "SELECT full_name, email, contact FROM accounts WHERE email = ?";
    db.query(sql, [email], (err, result) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).send("Internal Server Error");
        }
        if (result.length > 0) {
            res.json(result[0]); 
        } else {
            res.status(404).send("User not found");
        }
    });
});

// Route to fetch books by category
app.get("/books/:category", (req, res) => {
    const category = req.params.category;
    const sql = " SELECT book_id,title FROM books WHERE category = ?";
    
    db.query(sql, [category], (err, result) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).send("Internal Server Error");
        }
        res.json(result);
    });
});
//ROUTE TO ADD BOOKS TO CART
app.post("/cart/add", (req, res) => {
    const { user_id, book_id, quantity } = req.body;
    if (!user_id || !book_id) {
        console.error("Error: Missing user_id or book_id");
        return res.status(400).send("Error: Missing user_id or book_id");
    }

    const sql = "INSERT INTO books_cart (user_id, book_id, quantity) VALUES (?, ?, ?)";
    db.query(sql, [user_id, book_id, quantity || 1], (err, result) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).send("Error adding to cart");
        }
        res.send("Book added to cart");
    });
});
//ROUTE TO FETCH BOOKS FROM THE CART
app.get("/cart/:user_id", (req, res) => {
    const user_id = req.params.user_id;

    const sql = `
        SELECT bc.cart_id, b.title, b.book_id, bc.quantity 
        FROM books_cart bc
        JOIN books b ON bc.book_id = b.book_id
        WHERE bc.user_id = ?
    `;

    db.query(sql, [user_id], (err, result) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).send("Error fetching cart");
        }
        res.json(result);
    });
});
//ROUTE TO FETCH ITEMS AND CLEAR CART
app.post("/cart/book", (req, res) => {
    const { user_id } = req.body;

    const insertBookingsSql = `
        INSERT INTO bookings (user_id, book_id, booking_date)
        SELECT user_id, book_id, NOW() FROM books_cart WHERE user_id = ?
    `;

    const clearCartSql = "DELETE FROM books_cart WHERE user_id = ?";

    db.query(insertBookingsSql, [user_id], (err, result) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).send("Error booking books");
        }

        db.query(clearCartSql, [user_id], (err, result) => {
            if (err) {
                console.error("Database error:", err);
                return res.status(500).send("Error clearing cart");
            }

            res.send("Booking request sent for approval. we will notify you upon successful approval");
        });
    });
});
//ROUTE TO DROP BOOK FROM CART
app.post("/cart/remove", (req, res) => {
    const { user_id, book_id } = req.body;

    const sql = "DELETE FROM books_cart WHERE user_id = ? AND book_id = ?";
    db.query(sql, [user_id, book_id], (err, result) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).send("Error removing book from cart");
        }

        if (result.affectedRows > 0) {
            res.send("Book removed from cart successfully!");
        } else {
            res.status(404).send("Book not found in cart");
        }
    });
});

//return books route
app.post("/books/return", async (req, res) => {
    try {
      // Check if we received an array or single object
      const bookingsToReturn = Array.isArray(req.body) ? req.body : [req.body];
      
      // Define fine parameters
      const finePerDay = 5;  // Fine per overdue day
      
      const results = [];
      const errors = [];
      
      // Process each booking
      for (const booking of bookingsToReturn) {
        const { booking_id, book_id } = booking;
        
        // Validate input
        if (!booking_id || !book_id) {
          errors.push({
            booking_id: booking_id || "unknown",
            book_id: book_id || "unknown",
            message: "Both booking_id and book_id are required"
          });
          continue;
        }
        
        try {
          // Start transaction for this booking
          await db.promise().beginTransaction();
          
          // 1. Fetch the booking details
          const [bookingDetails] = await db.promise().query(
            `SELECT booking_id, book_id, booking_date, user_id 
             FROM bookings 
             WHERE booking_id = ? 
             AND status = 'checked_out'`,
            [booking_id]
          );
  
          // If booking not found, or already returned
          if (bookingDetails.length === 0) {
            await db.promise().rollback();
            errors.push({
              booking_id,
              book_id,
              message: "Booking not found or already returned"
            });
            continue;
          }
  
          const bookingDate = new Date(bookingDetails[0].booking_date);
          const currentDate = new Date();
          let fine = 0;
  
          // 2. Check if the book is overdue
          const timeDifference = currentDate - bookingDate;
          const daysOverdue = Math.floor(timeDifference / (1000 * 3600 * 24));
  
          if (daysOverdue > 0) {
            fine = daysOverdue * finePerDay;  // Calculate the fine
          }
  
          // 3. Update booking status and return date, also apply the fine if applicable
          const updateBooking = await db.promise().query(
            `UPDATE bookings 
             SET return_date = NOW(), 
                 status = 'returned', 
                 fine = ?
             WHERE booking_id = ?`,
            [fine, booking_id]
          );
  
          if (updateBooking[0].affectedRows === 0) {
            await db.promise().rollback();
            errors.push({
              booking_id,
              book_id,
              message: "Failed to update booking status"
            });
            continue;
          }
  
          // 4. Update available copies in the inventory (book return)
          const updateInventory = await db.promise().query(
            `UPDATE books 
             SET available_copies = available_copies + 1 
             WHERE book_id = ?`,
            [book_id]
          );
  
          if (updateInventory[0].affectedRows === 0) {
            await db.promise().rollback();
            errors.push({
              booking_id,
              book_id,
              message: "Book not found in inventory"
            });
            continue;
          }
  
          // Commit transaction if all queries succeed
          await db.promise().commit();
          
          // Add to successful results
          results.push({
            success: true,
            booking_id,
            book_id,
            fine,
            returned_at: new Date().toISOString()
          });
          
        } catch (error) {
          // Rollback the transaction in case of any error
          await db.promise().rollback();
          console.error("Return error for booking", booking_id, ":", error);
          errors.push({
            booking_id,
            book_id,
            message: "Internal server error during return process"
          });
        }
      }
      
      // Return final results
      res.json({
        success: errors.length === 0,
        message: `${results.length} book(s) returned successfully${errors.length > 0 ? ', with ' + errors.length + ' error(s)' : ''}`,
        results,
        errors: errors.length > 0 ? errors : undefined
      });
      
    } catch (error) {
      console.error("Global return error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during return process",
        error: error.message
      });
    }
  });

//Booking history route
app.get("/bookings/:user_id", (req, res) => {
    const user_id = req.params.user_id;
    
    console.log(`Fetching bookings for user: ${user_id}`); // Log the user_id
    
    const sql = `
        SELECT 
            b.book_id,
            b.title,
            b.category,
            bk.booking_id,
            bk.booking_date,
            bk.return_date,
            bk.status,
            DATEDIFF(COALESCE(bk.return_date, CURRENT_DATE()), bk.booking_date) AS duration_days
        FROM bookings bk
        JOIN books b ON bk.book_id = b.book_id
        WHERE bk.user_id = ?
        ORDER BY bk.booking_date DESC
    `;
    
    db.query(sql, [user_id], (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ 
                success: false,
                message: "Internal Server Error" 
            });
        }
        
        console.log("Bookings fetched:", results); // Log the fetched data
        
        if (results.length === 0) {
            return res.json({
                success: true,
                data: [] // Return empty array if no bookings
            });
        }

        const formattedResults = results.map(booking => ({
            ...booking,
            booking_date: new Date(booking.booking_date).toISOString().split('T')[0],
            return_date: booking.return_date 
                ? new Date(booking.return_date).toISOString().split('T')[0]
                : null,
            duration_days: booking.duration_days || "N/A"
        }));
        
        res.json({
            success: true,
            data: formattedResults
        });
    });
});

//settings routes
app.get("/profile/:user_id", (req, res) => {
    const user_id = req.params.user_id;
    const { full_name, email, contact } = req.body;

    const sql = "UPDATE accounts SET full_name = ?, email = ?, contact = ? WHERE user_id = ?";
    db.query(sql, [full_name, email, contact, user_id], (err, result) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ 
                success: false,
                message: "Internal Server Error" 
            });
        }
        
        res.json({
            success: true,
            message: "Profile updated successfully"
        });
    });
});

app.post("/change-password", async (req, res) => {
    const { user_id, current_password, new_password } = req.body;

    try {
        // 1. Verify current password
        const [users] = await db.promise().query(
            "SELECT * FROM accounts WHERE user_id = ?",
            [user_id]
        );

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        const user = users[0];
        
        // 2. Compare current password (use bcrypt.compare  passwords are hashed)
        if (current_password !== user.user_password) {
            return res.status(401).json({
                success: false,
                message: "Current password is incorrect"
            });
        }

        // 3. Update password 
        await db.promise().query(
            "UPDATE accounts SET user_password = ? WHERE user_id = ?",
            [new_password, user_id]
        );

        res.json({
            success: true,
            message: "Password changed successfully"
        });

    } catch (err) {
        console.error("Password change error:", err);
        res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
});


//help-support routes FAQs
app.get('/api/faqs', (req, res) => {
    const query = `
        SELECT id, question, answer, category 
        FROM faqs 
        WHERE active = 1 
        ORDER BY category, display_order
    `;
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching FAQs:', err);
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch FAQs'
            });
        }
        
        // Group FAQs by category
        const faqsByCategory = results.reduce((acc, faq) => {
            if (!acc[faq.category]) {
                acc[faq.category] = [];
            }
            acc[faq.category].push(faq);
            return acc;
        }, {});
        
        res.json({
            success: true,
            data: faqsByCategory
        });
    });
});


// GET user details
app.get('/api/users/:id', async (req, res) => {
    try {
        
        const [rows] = await db.promise().query(
            'SELECT user_id, full_name AS name, email FROM accounts WHERE user_id = ?',
            [req.params.id]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        res.json({
            success: true,
            user: rows[0]
        });
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// POST feedback
// Validation helpers
const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const getTicketMetadata = (type) => ({
  urgency: type === 'general' ? 'normal' : 'high',
  status: type === 'general' ? 'resolved' : 'open',
  subject: `Public Feedback: ${type}`
});

// Routes
app.post('/api/feedback', async (req, res) => {
  const { name, email, type, message } = req.body;

  // Simple validation
  if (!name || !email || !type || !message) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (!validateEmail(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  try {
    const { urgency, status, subject } = getTicketMetadata(type);
    
    const [result] = await db.promise().query(
      `INSERT INTO support_tickets SET ?`,
      {
        user_id: null,
        name,
        email,
        subject,
        message,
        urgency,
        status,
        created_at: new Date(),
        updated_at: new Date()
      }
    );

    res.json({ 
      success: true,
      ticketId: result.insertId 
    });
  } catch (error) {
    console.error('Feedback submission error:', error);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

// CORS Middleware 
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});




app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        message: 'Internal server error'
    });
});

app.get("/api/notifications/:userId", (req, res) => {
    const userId = req.params.userId;
    
    // SQL query to get all active bookings for this user
    const bookingsQuery = `
      SELECT 
        bookings.booking_id,
        bookings.book_id,
        books.title as book_title,
        bookings.booking_date,
        bookings.return_date,
        bookings.status,
        bookings.quantity
      FROM bookings
      JOIN books ON bookings.book_id = books.id
      WHERE bookings.user_id = ? 
      AND bookings.status IN ('borrowed', 'overdue')
    `;
    
    db.query(bookingsQuery, [userId], (err, bookings) => {
      if (err) {
        console.error("Error fetching bookings for notifications:", err);
        return res.status(500).json({
          success: false,
          message: "Failed to fetch notifications",
          error: err.message
        });
      }
      
      const notifications = [];
      const today = new Date();
      
      // Process each booking to generate appropriate notifications
      bookings.forEach(booking => {
        const returnDate = new Date(booking.return_date);
        const daysRemaining = Math.ceil((returnDate - today) / (1000 * 60 * 60 * 24));
        
        // Case 1: Book is overdue
        if (daysRemaining < 0) {
          // Calculate fine based on days overdue
          const daysOverdue = Math.abs(daysRemaining);
          const finePerDay = 2.00; // $2 per day, adjust as needed
          const fineAmount = daysOverdue * finePerDay * booking.quantity;
          
          notifications.push({
            id: `overdue-${booking.booking_id}`,
            type: 'overdue',
            title: 'Book Overdue',
            message: `"${booking.book_title}" (Qty: ${booking.quantity}) is overdue by ${daysOverdue} day(s). A fine of $${fineAmount.toFixed(2)} has been applied.`,
            book_id: booking.book_id,
            booking_id: booking.booking_id,
            return_date: booking.return_date,
            days_overdue: daysOverdue,
            fine_amount: fineAmount,
            severity: 'high',
            created_at: new Date().toISOString()
          });
        }
        // Case 2: Book is due within the next 3 days
        else if (daysRemaining <= 3) {
          notifications.push({
            id: `upcoming-${booking.booking_id}`,
            type: 'upcoming_return',
            title: 'Return Reminder',
            message: `"${booking.book_title}" (Qty: ${booking.quantity}) is due in ${daysRemaining} day(s). Please return it on time to avoid fines.`,
            book_id: booking.book_id,
            booking_id: booking.booking_id,
            return_date: booking.return_date,
            days_remaining: daysRemaining,
            severity: 'medium',
            created_at: new Date().toISOString()
          });
        }
      });
      
      // Sort notifications with most urgent ones first
      notifications.sort((a, b) => {
        if (a.type === 'overdue' && b.type !== 'overdue') return -1;
        if (a.type !== 'overdue' && b.type === 'overdue') return 1;
        if (a.type === 'overdue' && b.type === 'overdue') {
          return b.days_overdue - a.days_overdue; // Higher overdue days first
        }
        return a.days_remaining - b.days_remaining; // Lower remaining days first
      });
      
      res.json({
        success: true,
        count: notifications.length,
        notifications: notifications
      });
    });
  });
  
  // Update overdue books status (to be run via a scheduled task)
  app.post("/api/admin/update-overdue-books", (req, res) => {
    // This endpoint can be secured with admin authentication
    
    const updateQuery = `
      UPDATE bookings 
      SET status = 'overdue' 
      WHERE status = 'borrowed' 
      AND return_date < CURDATE()
    `;
    
    db.query(updateQuery, (err, result) => {
      if (err) {
        console.error("Error updating overdue books:", err);
        return res.status(500).json({
          success: false,
          message: "Failed to update overdue books",
          error: err.message
        });
      }
      
      res.json({
        success: true,
        message: `Updated ${result.affectedRows} books to overdue status`
      });
    });
  });




// Start the server 
app.listen(3000, () => {
    console.log(`Server running at http://localhost:${port}/library.html`);
});