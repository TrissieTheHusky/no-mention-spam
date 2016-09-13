// Required external modules
const moment = require("moment");
const util = require("util");
const request = require('superagent');

// Load server configuration modules (database interaction)
const confs = require('./serverconf.js');

// Get Discord.js dependency
const Discord = require('discord.js');
const bot = new Discord.Client({autoReconnect: true, fetch_all_members: true});

// some DB things are still done here. Let's load it (removed in the future)
const db = require('sqlite');


const settings = require('./auth.json');

bot.once('ready', () => {
  bot.user.setStatus('online', "Say: spambot.info");
	confs.init(bot);
  console.log(`Ready to kick spammer's asses on ${bot.guilds.size} guilds.`);
});

bot.on('guildCreate', (guild) => {
  console.log(`New guild has been joined: ${guild.name}`);
  confs.add(guild).then(console.log).catch(console.error);
  let server_owner = guild.owner;
  server_owner.sendMessage(`Hi ${server_owner.user.username}! Sorry to bother you!
I'm a bot, see, that can only be configured, initially, by the server owner, to prevent tampering.
Please use \`spambot.help\` to get a list of owner/mod commands. YOU are the only one who can set the \`mod_role\` configuration (name or id of role)
Anyone with the role will be able to set the rest of the options.
Again, this secures and simplifies the process and I'm sorry to bother you!`);
});

const banned_ids = ["224418473286041601", "224426434339274752", "203868728884985857", "224431797533016064"];
bot.on("guildMemberAdd", (guild, member) => {
  console.log(`${member.user.username} ("${member.user.id}") joined ${guild.name}`);
  if(banned_ids.includes(member.user.id)) {
    member.ban().then( () =>{
      console.log(`[${moment().format("YYYY-MM-DD HH:mm:ss")}] Pre-Emptively Banned ${member.user.username} from ${guild.name}`);
    }).catch(console.error);
  }
})

bot.on('guildDelete', (guild) => {
  console.log(`[GUILD DELETED]: I've been removed from: ${guild.name}`);
  confs.remove(guild).catch(console.error);
});

bot.on('message', message => {
  // Don't use 2 message handlers unless you know WHY!
  // in this case, separation of "spam trigger" vs "commands"
  if(!message.guild) return;
  
	var conf = confs.get("default");
	if(message.guild) {
	  conf = confs.get(message.guild);
	}
	
	// Temporary (?) exception to this fucking asshole?
	if(message.content.includes("👎Hillary👎")) {
	  message.guild.member(message.author).ban(1).then(() => {
	    console.log(`[${moment().format("YYYY-MM-DD HH:mm:ss")}] Banned ${message.author.username} from ${message.guild.name}`);
	  });
	}

  if(parseInt(conf.ban_level, 10) > 0 && message.mentions.users.size >= parseInt(conf.ban_level, 10)) {

    db.open('./modlog.sqlite').then(() => {
      db.run(`INSERT INTO "banlog" (user_id, username, user_dump, mention_count, message_content, server_id, server_name, channel_id, channel_name, log_level) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
      [message.author.id, message.author.username, util.inspect(message.author), message.mentions.users.size, message.content, message.guild.id, message.guild.name, message.channel.id, message.channel.name, "ban"]).then ( ()=> {
        console.log(`[${moment().format("YYYY-MM-DD HH:mm:ss")}] Banned ${message.author.username} from ${message.guild.name}`);
      }).catch(console.error);
    });
    
    // Add to Discord Global Ban list
    //if(settings.dbots.url) post_global_ban(message);
    
    message.member.ban(1).then(() => {
      message.channel.sendMessage(`:no_entry_sign: User ${message.author.username} has just been banned for mentionning too many users. :hammer: 
  Users that have been mentioned, we apologize for the annoyance. Please don't be mad!`);
    });
    return;
  }

  if(parseInt(conf.kick_level, 10) > 0 && message.mentions.users.size >= parseInt(conf.kick_level, 10)) {
    let kick_msg = `${message.author.username} has been kicked for using too many mentions.`;

    db.open('./modlog.sqlite').then(() => {
      db.run(`INSERT INTO "banlog" (user_id, username, user_dump, mention_count, message_content, server_id, server_name, channel_id, channel_name, log_level) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
      [message.author.id, message.author.username, util.inspect(message.author), message.mentions.users.size, message.content, message.guild.id, message.guild.name, message.channel.id, message.channel.name, "ban"]).then ( ()=> {
        console.log(`done`);
      }).catch(console.error);
    });

    message.member.ban().then(mem => message.guild.unban(mem.user)).then(() => {
      if(conf.modlog_channel) {
        message.guild.channels.get(conf.modlog_channel).sendMessage(kick_msg)
        .catch(console.error);
      }
    })
    .catch(console.error);
    return;
  }

});

bot.on('message', message => {
  if(message.author.bot) return;

	var conf = confs.get("default");
	if(message.guild) {
	  conf = confs.get(message.guild);
    //console.log(`<${message.guild.name}> #${message.channel.name} ; ${message.author.username}:  ${message.content}`);
	}
	
  if(!message.content.startsWith(conf.prefix) && !message.content.startsWith(settings.default_server_conf.prefix)) return;
  
  let command = message.content.split(" ")[0];
  if(command.startsWith(conf.prefix)) command = command.replace(conf.prefix, "");
  if(command.startsWith(settings.default_server_conf.prefix)) command = command.replace(settings.default_server_conf.prefix, "");
  var params = message.content.split(" ");
  
  if(command === "info") {
    return message.channel.sendMessage(`Hi ${message.author.username}!
    I'm no-mention-spam and I protect you against mention spams!
    I am currently on ${bot.guilds.size} servers, and was created by LuckyEvie#4611 (139412744439988224)`);
  }
  
  if(command === "invite") {
    return message.channel.sendMessage(`To invite this bot:
    <https://discordapp.com/oauth2/authorize?client_id=219487222913695754&scope=bot&permissions=4>
    For support, join https://discord.gg/7x4JmsH !`)
  }
  
  // eh, I have to put this before server check so I can do private evals. So sue me.
  if(message.author.id === settings.ownerid && command === "eval") {
    try {
      var suffix = params.splice(1).join(" ");
      var evaled = eval(suffix);
      
      if(evaled instanceof Object)
        evaled = JSON.stringify(evaled);
      
      message.channel.sendMessage("```xl\n" + clean(evaled) + "\n```");   
    } catch(err) {
      message.channel.sendMessage("`ERROR` ```xl\n" + clean(err) + "\n```");
    }
    return;
  }

  if(!message.guild) {
    message.author.sendMessage(`For info please type \`spambot.info\`. Any other command needs to be done in a server where this bot is located!`);
    return console.log(`Private Message from ${message.author.username} : \n  ${message.content}`);
  }

  // check perms
  // MOD Commands
  try{ 
  //console.log(conf.mod_role);
  let mod_role = conf.mod_role ? conf.mod_role : null;
  let server_owner = message.guild.owner.id;
  var perm_level = 0;
  if(mod_role && message.member.roles.exists("id", mod_role)) perm_level = 1;
  if(message.author.id === "68396159596503040") perm_level = 1; // I see you, Carbonitex (Matt).
  if(message.author.id === server_owner) perm_level = 2;
  if(message.author.id === settings.ownerid) perm_level = 3;
  } catch (e) {
    console.error(e);
  }
  console.log(`Command ${params[0]} called by ${message.author.username}(${message.author.id}) in ${message.guild.name}:\n  ${message.content}`);

  if(command === "help") {
    message.author.sendMessage(help_message);
    if(message.guild) message.reply(`Please check Direct Messages for help!`);
    return;
  }

  if(perm_level < 1) return;
  // MOD_ROLE COMMANDS
  //console.log(params);
  let conf_cmd = "";
  if(["get", "set", "view"].includes(params[1])) conf_cmd = params[1];
  //console.log(conf_cmd);
  
  if(command == "conf" && conf_cmd == "get") {
    if(!conf[params[2]]) return message.reply(`Key \`${params[2]}\` not found in server configuration.`);
    return message.reply(`Configuration key \`${params[2]}\` currently set to \`${conf[params[2]]}\``);
  }
  
  if(command == "conf" && conf_cmd == "set") {
    if(params[2] === "mod_role" && perm_level < 2) return message.reply(`\`${params[2]}\` can *only* be set by the server owner!`);
    confs.set(message.guild, params[2], params.slice(3).join(" "))
    .then((e) => message.reply(e))
    .catch((e) => {
      message.reply(e);
      console.error(e);
    });
  }
  
  if(command == "conf" && conf_cmd == "view") {
    return message.channel.sendMessage(make_conf(conf, message));
  }
  
});

bot.on('error', (error) => {
  console.error(error);
})

bot.login(settings.token);

function clean(text) {
  if (typeof(text) === "string") {
    return text.replace(/`/g, "`" + String.fromCharCode(8203)).replace(/@/g, "@" + String.fromCharCode(8203));
  }
  else {
      return text;
  }
}

function post_global_ban(message) {
  request
  .post(settings.dbots.url + "/user")
  .send({"id": message.author.id, "mentionCount": message.mentions.users.size, "notes": `Automatic ban by @no-mention-spam on ${message.guild.name}/#${message.channel.name}`})
  .set('Authorization', settings.dbots.key)
  .set('Accept', 'application/json')
  .end(err => {
      if (err) return console.error(err);
  });
}

const help_message = `\`\`\`xl
COMMAND HELP
Assumes you have not changed the default prefix

spambot.info - Displays basic bot info and invite link.
spambot.help - Displays this help (no, really!)

Server Owner / mod_role useable only: 
spambot.conf - Configure the server settings
  conf get <Key>
    'displays the current configuration value'
  conf set <Key> <Value>
    'modifies the value for your server.'
  conf view
    'displays the current server configuration.'
    
Example:
  spambot.conf set ban_level 10
  spambot.conf set prefix >
  >invite
  (because prefix changed)

Available configuration keys: 
  prefix - <String> (false to reset)
    'custom server prefix. Disables the default "spambot." prefix.'
  kick_level - <Int> (0 to disable, Default 10)
    'mention count at which to kick the user from the server.'
  ban_level - <Int> (min 2, Default 15)
    'mention count at which to ban the user. Removes 1 day of messages.'
  mod_role - <RoleName> (false to disable)
    'the name of the role that has permission to change config besides the server owner.'
  modlog_channel - <ChannelID>
    'the ID of the channel where mod logs should be posted (warn/kick/ban). Bans always trigger a message regardless.'
  get_global_bans - <Boolean> (true/false)
    'whether to retrieve Dbans global bans for known mention spammers.'
\`\`\``;

function make_conf(conf, message) {
  return `\`\`\`xl
CURRENT SERVER CONFIGURATION
This is your current server configuration.
Name: ${message.guild.name}
Owner: ${message.guild.owner.user.username}

prefix         : ${conf.prefix}
kick_level     : ${conf.kick_level}
ban_level      : ${conf.ban_level}
mod_role       : ${conf.mod_role}
modlog_channel : ${conf.modlog_channel}
get_global_bans: ${conf.get_global_bans}
\`\`\``;
}

process.on('uncaughtException', (err) => {
  let errorMsg = err.stack.replace(new RegExp(`${__dirname}\/`, 'g'), './');
  // bot.getDMChannel('175008284263186437').then(DMChannel => {
  //   bot.createMessage(DMChannel.id, `\`UNCAUGHT EXCEPTION\`\n\`\`\`sh\n${errorMsg}\n\`\`\``);
  // }).catch(error);
 console.error(errorMsg);
});