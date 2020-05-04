// This sample demonstrates handling intents from an Alexa skill using the Alexa Skills Kit SDK (v2).
// Please visit https://alexa.design/cookbook for additional examples on implementing slots, dialog management,
// session persistence, api calls, and more.

/////////////////////////////////
// Modules Definition
/////////////////////////////////

// ASK SDK
const Alexa = require('ask-sdk-core');
const fetch = require('node-fetch');
// ASK SDK adapter to connecto to Amazon S3
// const persistenceAdapter = require('ask-sdk-s3-persistence-adapter');
const persistenceAdapter = require('ask-sdk-dynamodb-persistence-adapter');
const askTableName = 'music-table';
// i18n library dependency, we use it below in a localisation interceptor
const i18n = require('i18next');
// We import a language strings object containing all of our strings.
// The keys for each string will then be referenced in our code, e.g. handlerInput.t('WELCOME_MSG')
const languageStrings = require('./languageStrings');
// We will use the moment.js package in order to make sure that we calculate the date correctly
const moment = require('moment-timezone');

/////////////////////////////////
// Handlers Definition
/////////////////////////////////

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    handle(handlerInput) {
        const speakOutput = 'Hello! I can help you play music of your choice. But I need some information first. What is your full name, favorite genre and phone number';
        const repromptOutput = "Let's start with telling me your full name"

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(repromptOutput)
            .getResponse();
    }
};


const HasUserAllInfoLaunchRequestHandler = {
    async canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        const attributesManager = handlerInput.attributesManager;
        const attributes = await attributesManager.getPersistentAttributes();
        const fullname = attributes.fullname;
        const favoritemusic = attributes.favoritemusic;
        const userphone = attributes.userphone;
        // console.log("HasUserAllInfoLaunchRequestHandler, canHandle    got from dynamodb fullname = ", fullname)
        
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest'
            && fullname 
            && favoritemusic
            && userphone;
    },
    async handle(handlerInput) {
        const { attributesManager } = handlerInput;
        const attributes = await attributesManager.getPersistentAttributes();
        const fullname = attributes.fullname; 
        const favoritemusic = attributes.favoritemusic; 

        let speakOutput = `Hello ${fullname}. What type of music are you in the mood for today? I can play your favorite, which is ${favoritemusic}, or rock, jazz, pop, or blues`;

        return handlerInput.responseBuilder
            .addDelegateDirective('UserMusicIntent')
            .speak(speakOutput)
            .getResponse();
    }
};

const UserFullnameIntentHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'UserFullnameIntent'
            && request.dialogState === 'STARTED';
    },
    handle(handlerInput) {
        const currentIntent = handlerInput.requestEnvelope.request.intent;
        
        return handlerInput.responseBuilder
            .addDelegateDirective(currentIntent)
            //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
            .getResponse();
    }
};

const InProgressUserFullnameIntentHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest' &&
          request.intent.name === 'UserFullnameIntent' &&
          request.dialogState === 'IN_PROGRESS';
      },
      handle(handlerInput) {
        const currentIntent = handlerInput.requestEnvelope.request.intent;
        return handlerInput.responseBuilder
          .addDelegateDirective(currentIntent)
          .getResponse();
      },    
}

const CompletedUserFullnameIntentHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest' &&
        request.intent.name === 'UserFullnameIntent' &&
        request.dialogState === 'COMPLETED';
    },
    async handle(handlerInput) {
        const { requestEnvelope, attributesManager } = handlerInput;
        const currentIntent = handlerInput.requestEnvelope.request.intent;

        const phoneNumberPattern = /^\(?(\d{3})\)?[- ]?(\d{3})[- ]?(\d{4})$/;
        let speakOutput = '';

        const fullname = Alexa.getSlotValue(requestEnvelope, 'fullname');
        
        const favoritemusic = Alexa.getSlotValue(requestEnvelope, 'favoritemusic');
        const userphone = Alexa.getSlotValue(requestEnvelope, 'userphone');

        // if (!userphone.match(phoneNumberPattern)) {
        //     speakOutput = "Please say a valid phone number";
        //     return handlerInput.responseBuilder
        //         .speak(speakOutput)
        //         .addElicitSlotDirective(userphone)
        //         .addDelegateDirective(currentIntent)
        //         .getResponse();
        // }
        
        const userAttributes = {
            "fullname" : fullname,
            "favoritemusic" : favoritemusic,
            "userphone" : userphone
        };
        
        attributesManager.setPersistentAttributes(userAttributes);
        await attributesManager.savePersistentAttributes();
        
        speakOutput = `Thanks, ${fullname}. I will remember your favorite music and phone number. What type of music are you in the mood for today? I can play your favorite, which is ${favoritemusic} or rock, jazz, pop, or blues`;
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .addDelegateDirective('UserMusicIntent')
            .getResponse();
      },    
}

const UserMusicIntentHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'UserMusicIntent';
    },
    async handle(handlerInput) {
        const currentIntent = handlerInput.requestEnvelope.request.intent;
        let speakOutput = ''; 
        const { requestEnvelope, attributesManager } = handlerInput;
        const attributes = await attributesManager.getPersistentAttributes();
        const favoritemusic = attributes.favoritemusic;
        let musictype = Alexa.getSlotValue(requestEnvelope, 'musictype');
        if (musictype == 'favorite' || musictype == undefined) {
            // currentIntent.slots.musictype.value =  favoritemusic;
            musictype =  favoritemusic;
        }
        
        const { accessToken } = handlerInput.requestEnvelope.context.System.user;

        if (!accessToken) {
            speakOutput = 'You must authenticate with your Spotify Account to use this skill. I sent instructions for how to do this in your Alexa app';
            return handlerInput.responseBuilder
                .speak(speakOutput)
                .withLinkAccountCard()
                .getResponse();
        } else {
            speakOutput = `Now playing ${musictype}`;
            return handlerInput.responseBuilder
                .speak(speakOutput)
                .getResponse();
            
        }
    }
}

/**
 * Handles AMAZON.HelpIntent requests sent by Alexa 
 * Note : this request is sent when the user makes a request that corresponds to AMAZON.HelpIntent intent defined in your intent schema.
 */
const HelpIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        const speakOutput = handlerInput.t('HELP_MSG');

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

/**
 * Handles AMAZON.CancelIntent & AMAZON.StopIntent requests sent by Alexa 
 * Note : this request is sent when the user makes a request that corresponds to AMAZON.CancelIntent & AMAZON.StopIntent intents defined in your intent schema.
 */
const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
                || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
    },
    handle(handlerInput) {
        const speakOutput = handlerInput.t('GOODBYE_MSG');

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};

/* *
 * SessionEndedRequest notifies that a session was ended. This handler will be triggered when a currently open 
 * session is closed for one of the following reasons: 1) The user says "exit" or "quit". 2) The user does not 
 * respond or says something that does not match an intent defined in your voice model. 3) An error occurs 
 * */
const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        const reason = handlerInput.requestEnvelope.request.reason;
        console.log("******* SESSION ENDED WITH REASON *******");
        console.log(reason); 
        return handlerInput.responseBuilder.getResponse();
    }
};

/* *
 * The intent reflector is used for interaction model testing and debugging.
 * It will simply repeat the intent the user said. You can create custom handlers for your intents 
 * by defining them above, then also adding them to the request handler chain below 
 * */
const IntentReflectorHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest';
    },
    handle(handlerInput) {
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        const speakOutput = handlerInput.t('REFLECTOR_MSG', { intentName: intentName });

        return handlerInput.responseBuilder
            .speak(speakOutput)
            //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
            .getResponse();
    }
};

/**
 * Generic error handling to capture any syntax or routing errors. If you receive an error
 * stating the request handler chain is not found, you have not implemented a handler for
 * the intent being invoked or included it in the skill builder below 
 * */
const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        console.log(`~~~~ Error handled: ${error.message}`);
        const speakOutput = handlerInput.t('ERROR_MSG');

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

/////////////////////////////////
// Interceptors Definition
/////////////////////////////////

/**
 * This request interceptor will log all incoming requests in the associated Logs (CloudWatch) of the AWS Lambda functions
 */
const LoggingRequestInterceptor = {
    process(handlerInput) {
        console.log("\n" + "********** REQUEST *********\n" +
            JSON.stringify(handlerInput, null, 4));
    }
};

/**
 * This response interceptor will log outgoing responses if any in the associated Logs (CloudWatch) of the AWS Lambda functions
 */
const LoggingResponseInterceptor = {
    process(handlerInput, response) {
        if (response) console.log("\n" + "************* RESPONSE **************\n"
            + JSON.stringify(response, null, 4));
    }
};

/**
 * This request interceptor will bind a translation function 't' to the handlerInput
 */
const LocalisationRequestInterceptor = {
    process(handlerInput) {
        i18n.init({
            lng: Alexa.getLocale(handlerInput.requestEnvelope),
            resources: languageStrings
        }).then((t) => {
            handlerInput.t = (...args) => t(...args);
        });
    }
};

/////////////////////////////////
// SkillBuilder Definition
/////////////////////////////////

/**
 * The SkillBuilder acts as the entry point for your skill, routing all request and response
 * payloads to the handlers above. Make sure any new handlers or interceptors you've
 * defined are included below. The order matters - they're processed top to bottom.
 */
exports.handler = Alexa.SkillBuilders.custom()
    // .withPersistenceAdapter(
    //     new persistenceAdapter.S3PersistenceAdapter({ bucketName: 'alexa-spot-music' })
    // )
    .withPersistenceAdapter(
        new persistenceAdapter.DynamoDbPersistenceAdapter({ tableName : 'music-table', createTable : true })
    )
    .addRequestHandlers(
        HasUserAllInfoLaunchRequestHandler,
        LaunchRequestHandler,
        UserFullnameIntentHandler,
        InProgressUserFullnameIntentHandler,
        CompletedUserFullnameIntentHandler,
        UserMusicIntentHandler,
        HelpIntentHandler,
        CancelAndStopIntentHandler,
        SessionEndedRequestHandler,
        IntentReflectorHandler) // make sure IntentReflectorHandler is last so it doesn't override your custom intent handlers
    .addErrorHandlers(
        ErrorHandler)
    .addRequestInterceptors(
        LocalisationRequestInterceptor,
        LoggingRequestInterceptor
    )
    .addResponseInterceptors(
        LoggingResponseInterceptor)
    .withApiClient(new Alexa.DefaultApiClient())
    .lambda();