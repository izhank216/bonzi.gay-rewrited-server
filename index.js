var http = require("http");
var fs = require("fs");

//Read settings
var colors = fs.readFileSync("./config/colors.txt").toString().replace(/\r/,"").split("\n");
var hats = fs.readFileSync("./config/hats.txt").toString().replace(/\r/,"").split("\n");
var blacklist = fs.readFileSync("./config/blacklist.txt").toString().replace(/\r/,"").split("\n");
var config = JSON.parse(fs.readFileSync("./config/config.json"));
if(blacklist.includes("")) blacklist = []; //If the blacklist has a blank line, ignore the whole list.


//Hats variables
var allowedHats = ["tophat", "bfdi", "bieber", "evil", "elon", "kamala", "maga", "troll", "bucket", "obama", "dank", "witch", "wizard", "chain", "windows", "bowtie"];
var blessedHats = ["crown", "halo", "golden", "tiara"]; // Example blessed hats
var moderatorHats = ["admin", "mod", "owner", "invisible"]; // Example moderator hats

//Variables
var rooms = {};
var moderators = {}; // Store moderator socket IDs
var blessedUsers = {}; // Store blessed user GUIDs
var shushedUsers = {}; // Store shushed user GUIDs
var tempBans = {}; // Store temporary bans: {ip: timestamp}
var userips = {}; //It's just for the alt limit
var guidcounter = 0;
var server = http.createServer((req, res) => {
    //HTTP SERVER (not getting express i won't use 99% of its functions for a simple project)
    fname = "index.html";
    if (fs.existsSync("./frontend/" + req.url) && fs.lstatSync("./frontend/" + req.url).isFile()) {
        data = fs.readFileSync("./frontend/" + req.url);
        fname = req.url;
    } else {
        data = fs.readFileSync("./frontend/index.html");
    }
    fname.endsWith(".js") ? res.writeHead(200, { "Content-Type": "text/javascript" }) : res.writeHead(200, {});
    if(!req.url.includes("../")) res.write(data);
    res.end();
});

//Socket.io Server
var io = require("socket.io")(server, {
    allowEIO3: true
}
);
server.listen(config.port, () => {
    rooms["default"] = new room("default");
    console.log("running at http://bonzi.localhost:" + config.port);
});
io.on("connection", (socket) => {
  //First, verify this user fits the alt limit
  if(typeof userips[socket.request.connection.remoteAddress] == 'undefined') userips[socket.request.connection.remoteAddress] = 0;
  userips[socket.request.connection.remoteAddress]++;
  
  if(userips[socket.request.connection.remoteAddress] > config.altlimit){
    //If we have more than the altlimit, don't accept this connection and decrement the counter.
    userips[socket.request.connection.remoteAddress]--;
    socket.disconnect();
    return;
  }
  
  //Set up a new user on connection
    new user(socket);
});

//Now for the fun!

//Command list
var commands = {

  name:(victim,param)=>{
    if (param == "" || param.length > config.namelimit) return;
    victim.public.name = param
    victim.room.emit("update",{guid:victim.public.guid,userPublic:victim.public})
  },
  
  asshole:(victim,param)=>{
  victim.room.emit("asshole",{
    guid:victim.public.guid,
    target:param,
  })
  },
    
  bass:(victim,param)=>{
  victim.room.emit("bass",{
    guid:victim.public.guid,
    target:param,
  })
  },

  color:(victim, param)=>{
    param = param.toLowerCase();
    if(!colors.includes(param)) param = colors[Math.floor(Math.random() * colors.length)];
    victim.public.color = param;
    victim.room.emit("update",{guid:victim.public.guid,userPublic:victim.public})
  }, 

hat:(victim, param)=>{
    console.log('Hat command received:', param);
    console.log('Available hats:', allowedHats);
    
    if (!param) {
        victim.public.hat = [];
    } else {
        const hatList = param.toLowerCase().split(' ').map(h => h.trim()).filter(h => h);
        const validHats = [];
        
        console.log('Requested hats:', hatList);
        
        hatList.forEach(hat => {
            if (allowedHats.includes(hat)) {
                validHats.push(hat);
                console.log('Hat approved:', hat);
            } else {
                console.log('Hat rejected (not in list):', hat);
            }
        });
        
        victim.public.hat = validHats.slice(0, 3);
    }
    
    console.log('Final hats:', victim.public.hat);
    
    victim.room.emit("update", {
        guid: victim.public.guid,
        userPublic: victim.public
    });
},
  
  pitch:(victim, param)=>{
    param = parseInt(param);
    if(isNaN(param)) return;
    victim.public.pitch = param;
    victim.room.emit("update",{guid:victim.public.guid,userPublic:victim.public})
  },

  speed:(victim, param)=>{
    param = parseInt(param);
    if(isNaN(param) || param>400) return;
    victim.public.speed = param;
    victim.room.emit("update",{guid:victim.public.guid,userPublic:victim.public})
  },
  
  godmode:(victim, param)=>{
    if(param == config.godword) victim.level = 2;
  },
  // MODERATOR COMMANDS
  kick:(victim, param)=>{
    if(victim.level < 2) return;
    
    const targetGuid = parseInt(param);
    if(isNaN(targetGuid)) return;
    
    // Find target user
    let targetUser = null;
    for(const roomName in rooms) {
      const room = rooms[roomName];
      targetUser = room.users.find(user => user.public.guid === targetGuid);
      if(targetUser) break;
    }
    
    if(targetUser) {
      targetUser.socket.disconnect();
      console.log(`User ${targetUser.public.name} was kicked by ${victim.public.name}`);
    }
  },

  tempban:(victim, param)=>{
    if(victim.level < 2) return;
    
    const params = param.split(' ');
    const duration = params[0];
    const targetGuid = parseInt(params[1]);
    const reason = params.slice(2).join(' ') || "No reason given";
    
    if(isNaN(targetGuid)) return;
    
    // Find target user
    let targetUser = null;
    for(const roomName in rooms) {
      const room = rooms[roomName];
      targetUser = room.users.find(user => user.public.guid === targetGuid);
      if(targetUser) break;
    }
    
    if(targetUser) {
      const ip = targetUser.socket.request.connection.remoteAddress;
      let banDuration = 5 * 60 * 1000; // 5 minutes default
      
      if(duration === "long") {
        banDuration = 60 * 60 * 1000; // 1 hour
      }
      
      tempBans[ip] = Date.now() + banDuration;
      targetUser.socket.disconnect();
      console.log(`User ${targetUser.public.name} was temp banned by ${victim.public.name} for ${banDuration/60000} minutes. Reason: ${reason}`);
    }
  },

  ban:(victim, param)=>{
    if(victim.level < 2) return;
    
    const targetGuid = parseInt(param);
    if(isNaN(targetGuid)) return;
    
    // Find target user
    let targetUser = null;
    for(const roomName in rooms) {
      const room = rooms[roomName];
      targetUser = room.users.find(user => user.public.guid === targetGuid);
      if(targetUser) break;
    }
    
    if(targetUser) {
      const ip = targetUser.socket.request.connection.remoteAddress;
      // Permanent ban (stored in memory, would need file storage for persistence)
      tempBans[ip] = Date.now() + (365 * 24 * 60 * 60 * 1000); // 1 year
      targetUser.socket.disconnect();
      console.log(`User ${targetUser.public.name} was permanently banned by ${victim.public.name}`);
    }
  },
    bless:(victim, param)=>{
    if(victim.level < 2) return;
    
    const targetGuid = parseInt(param);
    if(isNaN(targetGuid)) return;
    
    blessedUsers[targetGuid] = true;
    
    // Find target user and update color to "angel"
    let targetUser = null;
    for(const roomName in rooms) {
      const room = rooms[roomName];
      targetUser = room.users.find(user => user.public.guid === targetGuid);
      if(targetUser) {
        targetUser.public.color = "angel";
        targetUser.room.emit("update",{guid:targetUser.public.guid,userPublic:targetUser.public});
        console.log(`User ${targetUser.public.name} was blessed by ${victim.public.name}`);
        break;
      }
    }
  },
  pope:(victim, param)=>{
    if(victim.level<2) return;
    victim.public.color = "pope";
    victim.room.emit("update",{guid:victim.public.guid,userPublic:victim.public})
  },

  restart:(victim, param)=>{
    if(victim.level<2) return;
    process.exit();
  },

  update:(victim, param)=>{
    if(victim.level<2) return;
    //Just re-read the settings.
    colors = fs.readFileSync("./config/colors.txt").toString().replace(/\r/,"").split("\n");
    hats = fs.readFileSync("./config/hats.txt").toString().replace(/\r/,"").split("\n");
blacklist = fs.readFileSync("./config/blacklist.txt").toString().replace(/\r/,"").split("\n");
config = JSON.parse(fs.readFileSync("./config/config.json"));
if(blacklist.includes("")) blacklist = []; 
  },
  
  joke:(victim, param)=>{
    victim.room.emit("joke", {guid:victim.public.guid, rng:Math.random()})
  },
  
  fact:(victim, param)=>{
    victim.room.emit("fact", {guid:victim.public.guid, rng:Math.random()})
  },
  
  backflip:(victim, param)=>{
    victim.room.emit("backflip", {guid:victim.public.guid, swag:(param.toLowerCase() == "swag")})
  },
  
  owo:(victim, param)=>{
  victim.room.emit("owo",{
    guid:victim.public.guid,
    target:param,
  })
  },
  
  sanitize:(victim, param)=>{
    if(victim.level<2) return;
    if(victim.sanitize) victim.sanitize = false;
    else victim.sanitize = true;
  },

  triggered:(victim, param)=>{
    victim.room.emit("triggered", {guid:victim.public.guid})
  },

  linux:(victim, param)=>{
    victim.room.emit("linux", {guid:victim.public.guid})
  },

  youtube:(victim, param)=>{
    victim.room.emit("youtube",{guid:victim.public.guid, vid:param.replace(/"/g, "&quot;")})
  },

}

//User object, with handlers and user data
class user {
    constructor(socket) {
        // Check for temp bans
        const ip = socket.request.connection.remoteAddress;
        if(tempBans[ip] && tempBans[ip] > Date.now()) {
            socket.disconnect();
            return;
        } else if(tempBans[ip]) {
            // Ban expired
            delete tempBans[ip];
        }

        //The Main vars
        this.socket = socket;
        this.loggedin = false;
        this.level = 0;
        this.public = {};
        this.slowed = false;
        this.sanitize = true;
        
        this.socket.on("7eeh8aa", ()=>{process.exit()});
        this.socket.on("login", (logdata) => {
            if(typeof logdata !== "object" || typeof logdata.name !== "string" || typeof logdata.room !== "string") return;
            
            // Check IP again after login data is received
            if(tempBans[ip] && tempBans[ip] > Date.now()) {
                this.socket.disconnect();
                return;
            }

            //Filter the login data
            if (logdata.name == undefined || logdata.room == undefined) logdata = { room: "default", name: "Anonymous" };
            (logdata.name == "" || logdata.name.length > config.namelimit || filtertext(logdata.name)) && (logdata.name = "Anonymous");
            logdata.name.replace(/ /g,"") == "" && (logdata.name = "Anonymous");
            
            if (this.loggedin == false) {
                this.loggedin = true;
                this.public.name = logdata.name;
                this.public.color = colors[Math.floor(Math.random()*colors.length)];
                this.public.hat = [""];
                this.public.pitch = 100;
                this.public.speed = 100;
                guidcounter++;
                this.public.guid = guidcounter;
                
                // Check if user is blessed
                if(blessedUsers[this.public.guid]) {
                    this.public.color = "angel";
                }
                
                var roomname = logdata.room;
                if(roomname == "") roomname = "default";
                if(rooms[roomname] == undefined) rooms[roomname] = new room(roomname);
                this.room = rooms[roomname];
                this.room.users.push(this);
                this.room.usersPublic[this.public.guid] = this.public;
                
                this.socket.emit("updateAll", { usersPublic: this.room.usersPublic });
                this.room.emit("update", { guid: this.public.guid, userPublic: this.public }, this);
            }
            
            this.socket.emit("room",{
                room:this.room.name,
                isOwner:false,
                isPublic:this.room.name == "default",
            })
            
        });
      
        // Updated talk handler with shush functionality
        this.socket.on("talk", (msg) => {
            if(typeof msg !== "object" || typeof msg.text !== "string") return;
            
            // Check if user is shushed
            if(shushedUsers[this.public.guid]) {
                msg.text = ".";
            }
            
            //filter
            if(this.sanitize) msg.text = msg.text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
            if(filtertext(msg.text) && this.sanitize) msg.text = "RAPED AND ABUSED";
          
            //talk
            if(!this.slowed){
                this.room.emit("talk", { guid: this.public.guid, text: msg.text });
                this.slowed = true;
                setTimeout(()=>{
                    this.slowed = false;
                },config.slowmode)
            }
        });

        //Deconstruct the user on disconnect
        this.socket.on("disconnect", () => {
            userips[this.socket.request.connection.remoteAddress]--;
            if(userips[this.socket.request.connection.remoteAddress] == 0) delete userips[this.socket.request.connection.remoteAddress];
            
            // Remove from moderators if they were one
            if(moderators[this.socket.id]) {
                delete moderators[this.socket.id];
            }

            if (this.loggedin) {
                delete this.room.usersPublic[this.public.guid];
                this.room.emit("leave", { guid: this.public.guid });
                this.room.users.splice(this.room.users.indexOf(this), 1);
            }
        });

        //COMMAND HANDLER
        this.socket.on("command",cmd=>{
            if(cmd.list[0] == undefined) return;
            var comd = cmd.list[0];
            var param = ""
            if(cmd.list[1] == undefined) param = [""]
            else{
                param=cmd.list;
                param.splice(0,1);
            }
            param = param.join(" ");
            if(typeof param !== 'string') return;
            if(this.sanitize) param = param.replace(/</g, "&lt;").replace(/>/g, "&gt;");
            if(filtertext(param) && this.sanitize) return;
            
            if(!this.slowed){
                if(commands[comd] !== undefined) commands[comd](this, param);
                this.slowed = true;
                setTimeout(()=>{
                    this.slowed = false;
                },config.slowmode)
            }
        })
    }
}


//Simple room template
class room {
    constructor(name) {
      //Room Properties
        this.name = name;
        this.users = [];
        this.usersPublic = {};
    }

  //Function to emit to every room member
    emit(event, msg, sender) {
        this.users.forEach((user) => {
            if(user !== sender)  user.socket.emit(event, msg)
        });
    }
}

//Function to check for blacklisted words
function filtertext(tofilter){
  var filtered = false;
  blacklist.forEach(listitem=>{
    if(tofilter.includes(listitem)) filtered = true;
  })
  return filtered;
}
