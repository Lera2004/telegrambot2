const { Telegraf } = require("telegraf");
const NodeGeocoder = require("node-geocoder");
const fs = require('fs');
require('dotenv').config();
const { BOT_TOKEN } = process.env; 
const bot = new Telegraf(BOT_TOKEN);
const axios = require('axios');

const geocoder = NodeGeocoder({
  provider: "openstreetmap",
  language: "uk",
});

const userStorage = {};

let userFirstName = '';
let userLastName = '';
let userUsername = '';

function getLastTreeId() {
  const dataFile = 'tree_data.js';

  if (fs.existsSync(dataFile)) {
    const fileContents = fs.readFileSync(dataFile, 'utf-8');
    const data = JSON.parse(fileContents);

    if (data.length > 0) {
      return data[data.length - 1].TreeID;
    }
  }

  return 0;
}

const userStates = {};
const treeStatesDescriptions = {
  '🟢 Здорове': 'Кора дерева має природний колір і текстуру для свого виду. Листя або хвоя яскраво зелені та здорові, без ознак пожовклості. Гілки та гілочки дерева міцні, без тріщин або ознак загрози ламки.',
  '🟠 Пошкоджене': 'Можливі ознаки механічних пошкоджень, такі як подряпини, розриви кори, дірки або зламані гілки. Листя або хвоя можуть бути подряпані, зірвані або пошкоджені вітром або іншими фізичними чинниками. Дерево може показувати ознаки загрози інфекціями чи хворобами.',
  '🔴 Хворе': 'Листя або хвоя можуть бути засохлі, зірвані або пожовклі, інколи з чорними чи коричневими плямами. Можливі ознаки гниття або загибелі деяких гілок, що викликані хворобами або паразитами.',
  '⚪ Молоде': 'Дерево може бути менше за дорослі екземпляри свого виду. Листя або хвоя може мати яскравий зелений колір, свіжий вигляд та невелику кількість гілок. Стовбур може бути тонким і гладким, без видимих слідів старіння або великої кори.',
};

// Обробка команди /start
bot.start(ctx => {
  const userId = ctx.message.from.id;
  userStates[userId] = {
    hasSentLocation: false,
    location: null,
  };
  userFirstName = ctx.message.from.first_name;
  userLastName = ctx.message.from.last_name || "";
  userUsername = ctx.message.from.username || "";

  console.log(`Ім'я: ${userFirstName}`);
  console.log(`Прізвище: ${userLastName}`);
  console.log(`Нікнейм: ${userUsername}`);

  ctx.replyWithHTML(`Вітаємо у системі інвентаризації зелених насаджень у місті Запоріжжя! 🌳🌼 Натисніть кнопку, щоб надіслати вашу геолокацію:`, {
    reply_markup: {
      keyboard: [
        [{ text: 'Надіслати геолокацію 🌍', request_location: true }],
      ],
      one_time_keyboard: true,
    },
  });
});

// Обробка геолокації
bot.on('location', async (ctx) => {
  const userId = ctx.message.from.id;

  if (!userStates[userId].hasSentLocation) {
    userStates[userId].hasSentLocation = true;
    const latitude = ctx.message.location.latitude;
    const longitude = ctx.message.location.longitude;
    try {
      const location = await geocoder.reverse({ lat: latitude, lon: longitude });
      const address = location[0].formattedAddress;
      userStates[userId].longitude = longitude;
      userStates[userId].latitude = latitude;
      userStates[userId].location = address;

      console.log(`Користувач ${userId} відправив геолокацію: Широта ${latitude}, Довгота ${longitude}`);
      console.log(`Місце розташування: ${address}`);

      ctx.reply(`Дякуємо за вашу геолокацію! 
      Ви знаходитесь приблизно за адресою: ${address}`);

      ctx.reply("Тепер натисніть кнопку, щоб надіслати фото:", {
        reply_markup: {
          keyboard: [
            [{ text: 'Надіслати фото 📷', request_photo: true }]
          ],
          one_time_keyboard: true,
        },
      });
    } catch (error) {
      console.error(`Помилка геокодування: ${error.message}`);
      ctx.reply('Виникла помилка при обробці вашої геолокації.');
    }
  } else {
    ctx.reply('Ви вже надсилали геолокацію. Натисніть кнопку, щоб надіслати фото:');
  }
});

// Обробка фото
bot.on('photo', async (ctx) => {
  const userId = ctx.message.from.id;
  const photoId = ctx.message.photo[0].file_id;

  userStorage[userId] = {
    photoId: photoId,
    treeName: null,
    treeState: null,
    treeId: null,
  };

  // Збережіть фото у папці "photos" з унікальним ім'ям, що відповідає ідентифікатору користувача
  const photoLink = `photos/${userId}_${Date.now()}.jpg`;
  const photoFile = await bot.telegram.getFileLink(photoId);
  const photoDownload = await axios.get(photoFile, { responseType: 'arraybuffer' });
  fs.writeFileSync(photoLink, photoDownload.data);

  // Обробка назви дерева
  ctx.reply("Будь ласка, оберіть назву дерева🌳 або введіть її:", {
    reply_markup: {
      keyboard: [
        [{ text: 'Дуб' }, { text: 'Іва' }],
        [{ text: 'Тополя' }, { text: 'Ялинка' }],
        [{ text: 'Липа' }, { text: 'Каштан' }],
        [{ text: 'Сосна' }, { text: 'Береза' }]
      ],
      one_time_keyboard: true,
    },
  });
});

// Обробка текстового повідомлення
bot.on('text', async (ctx) => {
  const userId = ctx.message.from.id;
  const user = userStorage[userId];

  if (user) {
    if (!user.treeName) {
      user.treeName = ctx.message.text;

      let statesDescriptionText = '\n';
      for (const state in treeStatesDescriptions) {
        statesDescriptionText += `\n<b>${state}:</b> ${treeStatesDescriptions[state]}\n`;
      }

      ctx.replyWithHTML(statesDescriptionText);

      ctx.reply("Оберіть стан дерева, натиснувши на відповідний стан, який відповідає опису.🌿", {
        reply_markup: {
          keyboard: [
            [{ text: 'Здорове' }, { text: 'Хворе' }],
            [{ text: 'Пошкоджене' }, { text: 'Молоде' }],
          ],
          one_time_keyboard: true,
        },
      });
    } else if (!user.treeState) {
      user.treeState = ctx.message.text;

      const photoLink = `photos/${userId}_${Date.now()}.jpg`;
      const treeId = getLastTreeId() + 1;
      const latitude = userStates[userId].latitude;
      const longitude = userStates[userId].longitude;
      const treeName = user.treeName;
      const treeState = user.treeState;
      const location = userStates[userId].location;

      console.log(`Користувач ${userId} відправив фото з обраною назвою дерева: ${treeName}, стан: ${treeState}, ID: ${treeId}`);
      console.log(`Місце розташування: ${location}`);

      try {
        const data = {
          UserID: userId,
          First_Name: userFirstName,
          Last_Name: userLastName,
          Username: userUsername,
          Tree_Name: user.treeName,
          Tree_State: user.treeState,
          TreeID: treeId,
          PhotoLink: photoLink,
          Location: location,
          Latitude: latitude,
          Longitude: longitude,
        };


        await axios.post('http://localhost:3000/trees', data);
        console.log('Дані були успішно відправлені на сервер.');
        ctx.reply(`Дякуємо за інформацію 💚`);
      } catch (error) {
        console.error(`Помилка відправлення даних на сервер: ${error.message}`);
        ctx.reply('Виникла помилка при обробці вашої інформації. Будь ласка, спробуйте ще раз.');
      }

      delete userStorage[userId];
    }
  }
});

bot.launch();
