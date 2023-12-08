//Importera nödvändiga moduler
const express = require("express");
const app = express();
const mysql = require("mysql");


// Konfiguration för MySQL-anslutning
const con = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "bookcafe",
  multipleStatements: true, // Tillåt flera SQL-uttalanden i en enda förfrågan
});

// Middleware för att tolka JSON-data
app.use(express.json());

//Hasha lösenord, dvs dölja.
const crypto = require("crypto"); 
function hash(data) {
  const hash = crypto.createHash("sha256");
  hash.update(data);
  return hash.digest("hex");
}

//  Funktion för att skapa WHERE-villkor för SQL-fråga
const createCondition = function (query) {
  let output = " WHERE ";
  // Loopa igenom varje objekt i `query`.
  for (let key in query) {
    // Om det finns i COLUMNS, lägg till en del i strängen `output` som representerar ett villkor.
    if (COLUMNS.includes(key)) {
      output += `${key}="${query[key]}" OR `;
    }
  }
  if (output.length == 7) { // Om det inte finns, returnera tom sträng
    return "";
  } else {
    return output.substring(0, output.length - 4); // Returnera `output` utan de sista 4 tecknen (det sista " OR ").
  }
};

//Returnera en HTML dokument till klienten.
app.get("/", function(req, res){
    res.sendFile(__dirname + "/dokumentation.html");
});

// Servera statiska filer
app.use(express.static("filer"));

// Returnera en databastabell som JSON
app.get("/members", function (req, res) {
  let sql = "SELECT * FROM members";
  let condition = createCondition(req.query);
  
  console.log(sql + condition);
  con.query(sql + condition, function (err, result, fields) {
    //kontrollera fel, om det inträffar, skicka ett 500 meddelande
    if (err) {
        console.error(err);
        res.status(500).send("Intern serverfel"); // Skicka HTTP 500-statuskod vid fel
        return;
    }
    //Hasha lösenord för säkerhet!
    //Function som kollar alla members och tillämpar hasha lösenord
    result.forEach(member => {
        if (member.password) {          
          member.password = hash(member.password);
        }
    });
    
    res.send(result); // Skicka resultatet som JSON till klienten
  });
});

// Route-parameter för att filtrera efter ID i URL:en
app.get("/members/:id", function (req, res) {
  let sql = "SELECT * FROM members WHERE id=?";
  console.log(sql);
  con.query(sql, [req.params.id], function (err, result, fields) {

     // Kontrollera om resultatet är tomt eller ej
    if (result.length > 0) {
      res.send(result); // Skicka resultatet som JSON till klienten
    } else {
      res.sendStatus(404);  // Skicka 404-statuskod om ingen matchning hittades
    }
  });
});

// POST-rutt för att skapa en ny användare
app.post("/addMembers", function (req, res) {

  // Kontrollera obligatoriska fält som förväntas finnas i req.body
  let fields = ["username", "password", "name", "email"];
  let missingFields = [];
  
  // Loopa igenom varje fält i arrayen 'fields'
  // Kolla om det aktuella fältet inte finns i req.body eller om värdet är en tom sträng efter trimning.
  for (let field of fields) {  
    if (!req.body[field] || req.body[field].trim() === '') {
      missingFields.push(field);
    }
  }
  
  // Kolla om det finns några saknade fält.
  // Skapa ett felmeddelande som listar de saknade fälten.
  if (missingFields.length > 0) { 
    let errorMessage = "Följande fält saknas eller är tomma: " + missingFields.join(', ');
    res.status(400).send(errorMessage);  // Skicka ett felmeddelande med statuskod 400
    return;
  }

  // Kolla om användarnamnet redan används
  con.query("SELECT * FROM members WHERE username = ?", [req.body.username], function (err, result, fields) {
    if (err) {
      console.error(err);
      res.status(500).send("Internal server error");
      return;
    }

    if (result.length > 0) {
      // Användarnamnet används redan
      res.status(409).send("Användarnamnet används redan!");
      return;
    }
  
    // Om användardata är giltig
    if (isValidUserData(req.body)){

        let sql = `INSERT INTO members (username, password, name, email)
        VALUES ('${req.body.username}', 
        '${hash(req.body.password)}',
        '${req.body.name}',
        '${req.body.email}');
        SELECT LAST_INSERT_ID();`;
      
        console.log(sql);
      
         // Utför SQL-frågan för att sätta in användarinformation i databasen.
         // Kolla om det uppstod ett fel vid SQL-frågan.
        con.query(sql, function (err, result, fields) {
          if (err) throw err;

          console.log(result);
      
          // Skapa ett objekt med användarinformation för att skicka som svar till klienten
          let output = {
            id: result[0].insertId,
            username: req.body.username,
            name: req.body.name,
            email: req.body.email,
          };
          res.status(201).send(output);
          });
      } else {
          res.status(422).send("Användarnamn krävs");
      }

  });
});

// Funktion för att validera användardata
function isValidUserData(body) {
  // Kolla om alla nödvändiga fält i användardatan finns och inte är tomma strängar.
  if(body && body.username && body.password && body.name && body.email) {
    
    return (
        body &&
        body.username &&
        body.username.trim() !== '' &&
        body.name &&
        body.name.trim() !== '' &&
        body.password &&
        body.password.trim() !== '' &&
        body.email &&
        body.email.trim() !== ''
      );
  }
}

// Uppdatera befintligt data i databasen.
app.put("/members/:id", function (req, res) {
    // Kontrollera först om någon data finns i request-body
    if (!req.body) {
      res.sendStatus(400);
      return;
    }

    
  
    // Skapa en tom uppdateringssträng
    let updateString = "";
  
    // Lägg till varje fält om det finns i req.body
    if (req.body.username) {
        updateString += `username = '${req.body.username}', `;
      }
    
    if (req.body.name) {
      updateString += `name = '${req.body.name}', `;
    }
  
    if (req.body.email) {
      updateString += `email = '${req.body.email}', `;
    }
  
    if (req.body.password) {
        let passwordHash = hash(req.body.password);
      updateString += `password = '${passwordHash}', `;
    }
  
    // Ta bort sista kommat om något fält lades till
    if (updateString !== "") {
      updateString = updateString.slice(0, -2); // Ta bort de sista två tecknen (komma och mellanslag)
    } else {
      // Om ingen uppdatering behövs, skicka en 400 Bad Request
      res.sendStatus(400);
      return;
    }
  
    // Skapa SQL-frågan med placeholders för att undvika SQL-injektion
    let sql = `UPDATE members SET ${updateString} WHERE id = ?`;
  
    // Exekvera SQL-frågan med användning av placeholders
    con.query(sql, [req.params.id], function (err, result, fields) {
      if (err) {
        // Felhantering, skicka felmeddelande osv.
        console.error(err);
        res.sendStatus(500);
      } else {
        // Meddela klienten att request har processats OK
        res.sendStatus(200);
      }
    });
});

// Importera JSON Web Token (JWT)
const jwt = require("jsonwebtoken");
const { error } = require("console");

// Login-rutt för autentisering
app.post("/login", function (req, res) {
    let sql = `SELECT * FROM members WHERE username='${req.body.username}'`;
  
    con.query(sql, function (err, result, fields) {
      if (err) throw err;
      // Kontrollera om det inte finns något resultat (inget matchande användarnamn)
      if (result.length === 0) {
        res.sendStatus(401); // Otillåtet
        return;
      }
  
      const user = result[0]; // Hämta första användaren från resultatet ( användarnamn ska vara unik)
      const storedHashedPassword = user.password;
      const inputHashedPassword = hash(req.body.password);
      // Kontrollera om hashat lösenordet matchar
      if (inputHashedPassword === storedHashedPassword) {
        let payload = {  // Skapa en JWT-payload med användarens information

          sub: user.username,
          name: user.name,
          email: user.email,
        };
        let token = jwt.sign(payload, "NeverTryToGuessTheInfoXyz123%&/");
        // Lyckad inloggning
        res.json(token);
          
        
      } else {
        // Misslyckad inloggning
        res.sendStatus(401);
      }
  });
});

// Rutt för att ta bort en medlem baserat på ID
app.delete("/deleteMembers/:id", (req, res) => {
  let memberId = req.params.id; // Extrahera medlems-ID från URL-parametern
  let sql = "DELETE FROM members WHERE id = ?"; // Skapa en SQL-fråga
  con.query(sql, [memberId], (err, result, fields) =>{  // Utför SQL-frågan mot databasen 
    if (err) throw err;
    console.log("Antal medlemmar raderade");
    res.send("Medlem raderad med ID " + memberId); // Skicka svar till klienten med information om antalet rader som påverkades
  });

});


// Starta servern
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Servern körs på port ${PORT}`);
});
