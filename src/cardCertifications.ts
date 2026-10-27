// Reviewed existing cohort only. No build/import step promotes new cards.
// Fingerprints detect changed mechanics; CI must also execute the referenced suites.
import type {CardCertificate} from './cardRegistry';
export const cardCertifications:Readonly<Record<string,CardCertificate>>={
  "10202894": {
    "fingerprint": "a5213988a81dd120d8291fa521dda7799d0ccb469c867c61d34dda5eceb63067",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "11384280": {
    "fingerprint": "5e40056686936320fa9e152aec2f2ad79beb09e29fce1f2a324e805fa99e2dbb",
    "suites": [
      "tests/classicIgnitionEffects.test.cjs",
      "tests/engineRefactor.test.cjs"
    ]
  },
  "11868825": {
    "fingerprint": "eb769319944fecdb4aeedf8593482b53312f1cf5a58b1e7bd387f9a4c440ffa1",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "12472242": {
    "fingerprint": "ee84813a21a7ada1888a0cb510791cc9a506a54d42ec1cdcc31e1bc474452eec",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "12580477": {
    "fingerprint": "2f3824336d537d8f88a42b71d85b9d2014722a7c1a5db92076132057363675d4",
    "suites": [
      "tests/classicSpells.test.cjs"
    ]
  },
  "12607053": {
    "fingerprint": "f6a74008d95bd3c5b9efff2eff704ed689e281c21c19f77a19d2cfa0c262f9bb",
    "suites": [
      "tests/classicEngine.test.cjs"
    ]
  },
  "12829151": {
    "fingerprint": "81a114e1b9e7dae0bafd38703113578f5560b52f210ad866d72730755cf84251",
    "suites": [
      "tests/historicalNormalBatch4.test.cjs"
    ]
  },
  "13039848": {
    "fingerprint": "fff21d0d1c150df4014bbaecba3e9ff19bebe6a8cc7030052f6963429e72eeb9",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "13193642": {
    "fingerprint": "888854c521bfd1eaa6ec89ff658d9d01a1e805f2c72e969e20be06d9d9fb695c",
    "suites": [
      "tests/historicalNormalBatch4.test.cjs"
    ]
  },
  "13429800": {
    "fingerprint": "bec773ed4e3e5d565aa6be895c98d9f5b55b930b5ee0aa4a73706260a1dbf6c8",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "13723605": {
    "fingerprint": "36c5f2719c44ebb69040c3026c3cf2b9becf50c9aeff2331906d718ae3c599dd",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "14087893": {
    "fingerprint": "39278c3f786f1f0279c8e3db1a3f7f4fe62ba6ff0e17dc1cecfe50ed546e443b",
    "suites": [
      "tests/classicSummonResponses.test.cjs",
      "tests/classicTargetReview.test.cjs"
    ]
  },
  "14315573": {
    "fingerprint": "fe60baa78ea8979959cefe3edf906bcec2e60be405e850efda0f313c05fa40b7",
    "suites": [
      "tests/classicExpansionFamilies.test.cjs"
    ]
  },
  "15025844": {
    "fingerprint": "287128311e86463cc29ad1b674e67d444c2a308b576eceb2f4add494a65eb5af",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "15042735": {
    "fingerprint": "91fe5e055c5c3574bef18bcdbe037d0c7ac4c13f3a4340ccb7a02416eab64edb",
    "suites": [
      "tests/historicalNormalBatch4.test.cjs"
    ]
  },
  "15150371": {
    "fingerprint": "a64e5360bb1cfde4b13d1edc0ca817a9b8a3e5073442e3173917e232d9bc047e",
    "suites": [
      "tests/historicalNormalCertification.test.cjs"
    ]
  },
  "15303296": {
    "fingerprint": "1410509fe2fd484cb6455444ad42aebbb7c87bab7dd3d3b16d90a6e943c3e9ee",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "15401633": {
    "fingerprint": "2a3f6889a420f8aac29d19acb5a2c499dd13808c3fd5c9a38e520fa333c44b57",
    "suites": [
      "tests/historicalNormalBatch4.test.cjs"
    ]
  },
  "15480588": {
    "fingerprint": "094c0e1b1af822f438298f3eddbf179457f3d0827c588f025ad47fe1ebb5528c",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "15507080": {
    "fingerprint": "1435da21d47fab89977e9b0369403a4aa2a71ff2ca43da085880e5075eff76fd",
    "suites": [
      "tests/historicalNormalCertification.test.cjs"
    ]
  },
  "15510988": {
    "fingerprint": "4b368ed0e8de9b543632117aef82c54a8db40d36fa52b3b253cf7aafb394ab26",
    "suites": [
      "tests/historicalNormalCertification.test.cjs"
    ]
  },
  "16972957": {
    "fingerprint": "ac65d585da147aac37365efc72279c55090c135b81e4e69168e5efff4866d50f",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "17358176": {
    "fingerprint": "2a9eca51fa944482592d7700b79893170af0b3177d50a8dcd9e9f143af4572f5",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "17814387": {
    "fingerprint": "4c99b187a9a3f80aefdd9dd4362d17a57fb6ed887d7833b582d02b515bf605b7",
    "suites": [
      "tests/classicEngine.test.cjs"
    ]
  },
  "18144506": {
    "fingerprint": "6d30b80551538d631adc7e81297b0dfe10ac358125b37d20e2141e2dc4c565ed",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "18710707": {
    "fingerprint": "b30dc7e4950bde556c71d5608bbfd10ea00e9d3712762433e79f1d727ab718dc",
    "suites": [
      "tests/historicalNormalCertification.test.cjs"
    ]
  },
  "19159413": {
    "fingerprint": "e0bebb9034111e0393d48e0dfdf1937a26dad6211ef5f294726db2d9556e0684",
    "suites": [
      "tests/classicEngine.test.cjs"
    ]
  },
  "19523799": {
    "fingerprint": "34162147ba1f7fab2e3333ae5958990725a3901c5ef25a919b07da8e69475c0d",
    "suites": [
      "tests/classicEngine.test.cjs"
    ]
  },
  "19613556": {
    "fingerprint": "51ba04b7028ff9debaca6cc1a48d7734d369888e4de31532c8fbf9795389a189",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "20871001": {
    "fingerprint": "51f4962a5c67956cd31a74081232454291972786db9503acf3005d9a4641eb7a",
    "suites": [
      "tests/classicExpansionFamilies.test.cjs"
    ]
  },
  "21263083": {
    "fingerprint": "dcad82700b57ed2ea174663903a83826218219b16853328c21647ba4d18167a8",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "21347810": {
    "fingerprint": "f8ddf63517b4e35acd59f37d40828250224fc9ea15158bfab4f2acd5834ba3f2",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "22026707": {
    "fingerprint": "ba81237031c2427d864490d540e2e152bdcb725fed15621554c187e928764e3d",
    "suites": [
      "tests/historicalNormalCertification.test.cjs"
    ]
  },
  "22702055": {
    "fingerprint": "8e7a86adc1cd83bb06165962eb323f2664a601b1e5fd52a1a4e983b338b711f3",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "23424603": {
    "fingerprint": "355e49dd42d5610a9d3698466fbbf57f917f833f26a7a273cefcba0265a35a27",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "23771716": {
    "fingerprint": "7edd7f2180f492a6935d94aca8266ced33718a36c559f6f4de2d20f69a76285c",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "24068492": {
    "fingerprint": "6d106695d590e6b221f3b5461135b671da249135ab693b91c0e5f9663da32f1b",
    "suites": [
      "tests/classicEngine.test.cjs"
    ]
  },
  "24094653": {
    "fingerprint": "b1bf130eac464fcfae62c26b8ed5a70c3c6c955406158e619ce78f47c6bfd61c",
    "suites": [
      "tests/classicEngine.test.cjs",
      "tests/classicCardReview.test.cjs"
    ]
  },
  "24611934": {
    "fingerprint": "3f32c5959be98f476e57d136da562395c2f5b6f0fddc22557ebd2cb9773806ea",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "25769732": {
    "fingerprint": "c4eb8cbcbac934285400c5863fc91590a6a711a424af3b7deac5091466bb2c1a",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "25880422": {
    "fingerprint": "e4b71ca98c461761f89a166fef7ece6a2c417a19f3960c65bccf8d3de6f43b41",
    "suites": [
      "tests/classicEngine.test.cjs"
    ]
  },
  "26202165": {
    "fingerprint": "56f4b7c0ea7d5bd0c767294afd3da73478d38b334cb3be0bd60fc7c2d2359982",
    "suites": [
      "tests/classicGraveTriggers.test.cjs",
      "tests/engineRefactor.test.cjs"
    ]
  },
  "26378150": {
    "fingerprint": "ba18ac7c59bd6b5ef6acd498fad6f1f262338890b9b2d189ace12b0cd7c5f089",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "28279543": {
    "fingerprint": "1584673099b6d6514ea6b54cb6622de941fa8b4be73a33b0f38953e35da50e82",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "28546905": {
    "fingerprint": "a0666a717dc6718caaa7e050f38a0816ddc3aa0fc815d7cbef0170f91944e85c",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "28933734": {
    "fingerprint": "2edd4ff6ee19568e46966403e79a033203f9d0f74005bead1708d77840ec843e",
    "suites": [
      "tests/classicFlipEffects.test.cjs",
      "tests/engineRefactor.test.cjs"
    ]
  },
  "29401950": {
    "fingerprint": "4b709adbc79576f1f3bcf3119e4f67e5767709236df8653e9526ae7c63033035",
    "suites": [
      "tests/classicBanishment.test.cjs"
    ]
  },
  "29948642": {
    "fingerprint": "bfdbca3765eb6726012c45e0236b4f9d634da3b15206f0cf79625fd7e8f0c5ea",
    "suites": [
      "tests/historicalNormalBatch4.test.cjs"
    ]
  },
  "30113682": {
    "fingerprint": "6d696b29e75c4b5dda623b4c1587d33abdb2b90a8ad67a7484ae1196db7f2fff",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "30532390": {
    "fingerprint": "22cc3345eadc77118d1aac52727d3e54132cbd38c2fc887ab1502e4377703e57",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "31122090": {
    "fingerprint": "537b2a66f17750c2e6fb917fe02585d45c73d4277da841a96f3ada7afd79b762",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "31560081": {
    "fingerprint": "7d2a2563efe748044ea91e69c547496302e2fdc169106d99b23e1ced07b217c5",
    "suites": [
      "tests/classicFlipEffects.test.cjs",
      "tests/engineRefactor.test.cjs"
    ]
  },
  "32452818": {
    "fingerprint": "b6fc81808477e490ea17a058ffda3ef95ac824f14c2bc638f6688a77bf75c1a1",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "32809211": {
    "fingerprint": "7da20beb8de15da16874f3071db8f8442a69ddef5c1976d708d36eea0e6025e4",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "33064647": {
    "fingerprint": "429a4018b27df209a7ed7c017a9e9d51641a3607aa9cb0ec193f33d494d72a6f",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "34460851": {
    "fingerprint": "866af6462c506c939ea2173803489f24fb19ec22740c1ca8e7ada6d152d574e2",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "36304921": {
    "fingerprint": "9c268854b0e59f40748117db91f95c2e294d14c70896f3141480e15f92484932",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "36607978": {
    "fingerprint": "79d6ac7281f8fa45e679dc8b67b0c775c84d8940358c44ba0bd2d121b84d104c",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "37120512": {
    "fingerprint": "9f5204457437819afa1ad27f361859b7c9e28fe059ae2eb9ad33a916e7a3f496",
    "suites": [
      "tests/classicEngine.test.cjs",
      "tests/classicPersistentReview.test.cjs"
    ]
  },
  "37243151": {
    "fingerprint": "179ed7d5fc92ad7a4471a3815019d240e3b772353a15cb1192ff2f227ec18a9b",
    "suites": [
      "tests/historicalNormalBatch4.test.cjs"
    ]
  },
  "38142739": {
    "fingerprint": "48632667b3dd738e3ba24d79e56d77a1210aa344eb6da983588ed56ef92ffca2",
    "suites": [
      "tests/historicalNormalCertification.test.cjs"
    ]
  },
  "38199696": {
    "fingerprint": "f81b0db113d7469c8b13a6c1137aa9eb5651371e6d4da20288b6de23673a3ee4",
    "suites": [
      "tests/classicEngine.test.cjs"
    ]
  },
  "39175982": {
    "fingerprint": "280cc52253b29fa979388d872a2410cf914e75fb6d182d3453845b1f6a39fc29",
    "suites": [
      "tests/historicalNormalCertification.test.cjs"
    ]
  },
  "39774685": {
    "fingerprint": "0130aadc50877652a41afd4f1116b8b8522b67860a2d40b978ef9afd30cd06b7",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "40374923": {
    "fingerprint": "6d0e0b4c7cc116f0b96403166c1d02651ab4d353eb1755a4b7024d69f1a91b3b",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "40640057": {
    "fingerprint": "3e177ad44f5a896afc5d6d83370fa1d46331537b8ad89f774da9bb98ffdb5a4e",
    "suites": [
      "tests/classicQuickMonsters.test.cjs",
      "tests/engineRefactor.test.cjs"
    ]
  },
  "41218256": {
    "fingerprint": "45ff6e7e4b90e7d26e6810008752c6b95a04b1333ab647a96eadd1cc94733668",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "41392891": {
    "fingerprint": "3d99d5bc41f6b7f1e3ba91497a79a780d1dabb8855d3ee86c501720f9a3fc1c4",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "41949033": {
    "fingerprint": "d3448d7bd7234b683d48d4b465e52cf53fce91c74c453a158a43c1d15b4c9375",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "42703248": {
    "fingerprint": "01363305752e46c28815b36e6f2714efd5f490ffe2e8ceb5c539bd7418886f81",
    "suites": [
      "tests/classicEngine.test.cjs"
    ]
  },
  "43716289": {
    "fingerprint": "705b07479cfe8f5a301c593f750c19cc7e6a30f87cea1cf8e272831af111666f",
    "suites": [
      "tests/mechanicalBatch7.test.cjs"
    ]
  },
  "44095762": {
    "fingerprint": "e5cf024c9d55949aab36f64e0a19a59152b641b4943651dce4fa63e6ba1e18fd",
    "suites": [
      "tests/classicMirrorForce.test.cjs"
    ]
  },
  "44209392": {
    "fingerprint": "9d5f942f8d6373ce9a43b80c77461c2ba29e51b44f7e328774aa70d398ec2fbe",
    "suites": [
      "tests/classicEngine.test.cjs"
    ]
  },
  "44287299": {
    "fingerprint": "2b2f580950d4dde49551cde7253838ba8f9d6948f4b3c3870cfde05d3afc90dd",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "45121025": {
    "fingerprint": "6947bd89748e1225243767908235314454817cd2a712948a9ee97a774b41874a",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "45141844": {
    "fingerprint": "b248eb80cec8d8db6c7d60bb08cd6e84d0b06326ba5037f07086520b0a58deaf",
    "suites": [
      "tests/mechanicalBatch7.test.cjs"
    ]
  },
  "45231177": {
    "fingerprint": "5b7a4fde3aeb8d2b66fb079a87c6d8fb6267bf8cb125f705b3db7bf885f01c58",
    "suites": [
      "tests/duelExpansion.test.cjs"
    ]
  },
  "46009906": {
    "fingerprint": "4359669b0fb126f08bf2707597abfd4fc379bbbe0ec290a792b2ea5ca973a17e",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "46130346": {
    "fingerprint": "c42feabc7ec2a81474f5fb586bf035ba0834c3788142e601e619f58ef0671fa9",
    "suites": [
      "tests/classicExpansionFamilies.test.cjs"
    ]
  },
  "46457856": {
    "fingerprint": "2426906526d8770a2966aee32c518bb2eaf03513e318c0a7693a2d7889859238",
    "suites": [
      "tests/historicalNormalCertification.test.cjs"
    ]
  },
  "46474915": {
    "fingerprint": "09c56354d4743bbe0b925fc23e5738553b2ddf9c2d85a5a84f7f59665f9d5eee",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "46718686": {
    "fingerprint": "6a2aedd0bedf72d9227dbdc64ff4cb31e2e4f0e1efe98a2a2db65ff0ce96903e",
    "suites": [
      "tests/historicalNormalCertification.test.cjs"
    ]
  },
  "46918794": {
    "fingerprint": "091ea5bb8048f0347ad6e6a0f136812916fcbe9f992be6c08eedb2f2033e160d",
    "suites": [
      "tests/classicExpansionFamilies.test.cjs"
    ]
  },
  "46986414": {
    "fingerprint": "a05b7305b72031f37457c7f8b52a8d0034edce466c4d8850e536ecaeaeea4172",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "47060154": {
    "fingerprint": "a6f1500309c291ebd6151809938f79bf439b671527595f37b07ef8e09843dd45",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "47695416": {
    "fingerprint": "80ade0467259c128bafe26adc4dd46fef91922419a158aee7e46d13192124966",
    "suites": [
      "tests/historicalNormalCertification.test.cjs"
    ]
  },
  "47852924": {
    "fingerprint": "fc4c876e374637f9ad2607213974c8bad1f9c682bff343b3c20bdaf88ee16215",
    "suites": [
      "tests/classicExpansionFamilies.test.cjs"
    ]
  },
  "48305365": {
    "fingerprint": "f9563dbc0dcec699e1c9828ded68ad8b551698b82ba1d9e10931782846c41d13",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "48365709": {
    "fingerprint": "3c1846cbf731d049a239a7bcfab8ea0d7c58e880c4d003a94204dcfa301896fa",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "49218300": {
    "fingerprint": "94feed92386bd6f819395741e57c8fde61b720381039828dc36ccbdcac3f0c0f",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "49258578": {
    "fingerprint": "2bb33a43e604da1bac6bd8eaaf492501d961a4b0dfabbd7ff17ac2e861e8e323",
    "suites": [
      "tests/historicalNormalBatch4.test.cjs"
    ]
  },
  "50005633": {
    "fingerprint": "ba22bb91f586579945838816617eaa0a9fc7b4f16fa4a23a25bd3d4a86608715",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "50913601": {
    "fingerprint": "5a3ee510125d4edb290ff6354591d1c47f7be74a7ab269e4a1ddf110501e8ebe",
    "suites": [
      "tests/classicEngine.test.cjs",
      "tests/classicPersistentReview.test.cjs"
    ]
  },
  "50930991": {
    "fingerprint": "86cfa3ae0fd3ebbd22495c150d4ae380018d8b65c7ded54657533051d139ecab",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "51371017": {
    "fingerprint": "b4e635b1d69d9d17e8c6805c69dba6ebcc7da042ec78ab79152bdd0975dce422",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "51482758": {
    "fingerprint": "3068f5b3f22534e93617185161bf4911de9586b18d53b0080fe7f1e726b9aa30",
    "suites": [
      "tests/classicEngine.test.cjs"
    ]
  },
  "52097679": {
    "fingerprint": "e9362b2005ba552ae33eb593b29ce847026824c0285b7af958fc741f2ddb522e",
    "suites": [
      "tests/classicEngine.test.cjs",
      "tests/classicPersistentReview.test.cjs"
    ]
  },
  "52800428": {
    "fingerprint": "9db9f806ace825bf52e7d39e3bc955fa8648597e69007b38f8e28fa5e97ce5f1",
    "suites": [
      "tests/historicalNormalCertification.test.cjs"
    ]
  },
  "53129443": {
    "fingerprint": "db39c8e41763deb9b508ee85d67c3bad80cf377ba47fe5583988d07833d923cd",
    "suites": [
      "tests/classicEngine.test.cjs"
    ]
  },
  "53293545": {
    "fingerprint": "2fdeb4682d02d1584d004ee9bb3fefe596aefa21fe1957c259ebb4b8523aadd7",
    "suites": [
      "tests/historicalNormalBatch4.test.cjs"
    ]
  },
  "53581214": {
    "fingerprint": "95327df70a9acaaecfeea6879bd15d6d8dc5b89d259ea1b56527d4918d877702",
    "suites": [
      "tests/historicalNormalCertification.test.cjs"
    ]
  },
  "53582587": {
    "fingerprint": "bda9d1246a78eeca066cafd0a90be4522a1189cb7f2a3e6495606a2baf4e5f9d",
    "suites": [
      "tests/classicSummonResponses.test.cjs"
    ]
  },
  "53832650": {
    "fingerprint": "4acfa8add27e3730493a3e396c9bf9230e64373a944da9c19fb0dfbd82e65d69",
    "suites": [
      "tests/historicalNormalCertification.test.cjs"
    ]
  },
  "54098121": {
    "fingerprint": "87822f28fcf690c38603ae676f7addd44378de5daf71aed03d75c3278fecbc2d",
    "suites": [
      "tests/classicSummonTriggers.test.cjs",
      "tests/engineRefactor.test.cjs"
    ]
  },
  "54652250": {
    "fingerprint": "1fe072a297cd7f3c9e72832cff565cefe3e95e990974e558aad2ed7f27ffc009",
    "suites": [
      "tests/classicFlipEffects.test.cjs",
      "tests/engineRefactor.test.cjs"
    ]
  },
  "55144522": {
    "fingerprint": "3f5cace2491286d6563f0c73cc79fc2df2eaf9b6d2d52cc8e54efef7eb9b31fe",
    "suites": [
      "tests/classicEngine.test.cjs",
      "tests/classicCardReview.test.cjs"
    ]
  },
  "55444629": {
    "fingerprint": "0b4b4fbe1b8d13d98e293433b843aa541939817325d0f9bbdd332367ddd6e99a",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "55550921": {
    "fingerprint": "bba2593d06d4c1a6c6f3a3e432fcf599773a378dcaf3c6aafb515a8fbc4de122",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "56120475": {
    "fingerprint": "b3750f8f181e2e79e21ee3187abbfb4df606495883ef30066e6051429836bf54",
    "suites": [
      "tests/classicSakuretsu.test.cjs"
    ]
  },
  "57839750": {
    "fingerprint": "f750e6a2f9710fcbda1d99a6c500952afc85e2cb39992ee4b0c89f20615d2347",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "58861941": {
    "fingerprint": "3fe5e42d92e9b4a81e152cb599c897daf2806f7c0e3dc06ff90bfee9aa12c490",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "59197169": {
    "fingerprint": "56b985586b91ee677008660672887404d42a7595292d6644678bf0e8196d7885",
    "suites": [
      "tests/classicEngine.test.cjs",
      "tests/classicPersistentReview.test.cjs"
    ]
  },
  "60694662": {
    "fingerprint": "ff32528e464b89d0187a11f5e289ee656d3812eda7a764b2d9309642e35e52b6",
    "suites": [
      "tests/classicFlipEffects.test.cjs",
      "tests/engineRefactor.test.cjs"
    ]
  },
  "60806437": {
    "fingerprint": "904fc92dd093ca751f2f3f619dc7152cc4f14b5ee7c5998ffd868a154edf8835",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "61201220": {
    "fingerprint": "fc80a9ae5ab30ed502996a6dd0242d37f8fe7da58d231312bddaafcc786e4517",
    "suites": [
      "tests/historicalNormalBatch4.test.cjs"
    ]
  },
  "61854111": {
    "fingerprint": "c1cda237225da99c3fe4fccf8dfbf436a0c4ea2be035b6128e8a1f165d812a8f",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "62279055": {
    "fingerprint": "7e56b2034337cce06e946f042446f33e3b99ce84c1b3297ba5a3cf84bd6da055",
    "suites": [
      "tests/classicExpansionFamilies.test.cjs"
    ]
  },
  "63308047": {
    "fingerprint": "72014f58d182178561f2e21d4d34eda88f0ca16c03927ae9d9d106e7d50e0e55",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "64154377": {
    "fingerprint": "6d64050e3f8019b582b6e2fddf5b2f24b4de54c4c096f9cc29b8da0ef0f24b0e",
    "suites": [
      "tests/historicalNormalBatch4.test.cjs"
    ]
  },
  "64511793": {
    "fingerprint": "8890ddce65b47995b2a8949d1c2394696f79b6489b4ad3226fdd285e4a6e3179",
    "suites": [
      "tests/historicalNormalCertification.test.cjs"
    ]
  },
  "66672569": {
    "fingerprint": "30721d13907bb9ba3c429a7507f360ece81a2055eaed36f8dd42de34e07f8e4d",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "66788016": {
    "fingerprint": "1f54ab7899bf901a02f4bb6466681787a9836921ac3d263a8addb7d2e49619b3",
    "suites": [
      "tests/classicEngine.test.cjs",
      "tests/classicCardReview.test.cjs"
    ]
  },
  "66889139": {
    "fingerprint": "3aa8c37db635f465b8ae80da250208d6d19cc540cd01f8497177453aa425b177",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "67494157": {
    "fingerprint": "9038d4d8351fb4abcebf037eb2d62131bacb4f4c14317234e3f35d4ade56f675",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "67724379": {
    "fingerprint": "c62b1c8958b5617472350959670045e72aebaa887450eb0e5d33a52feddc62de",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "68516705": {
    "fingerprint": "4e8cfabacf5c2bc35eebe4c74e2e0b1892a7df73bf762f90f9627e307ebf6916",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "69579761": {
    "fingerprint": "ef5dc4a8798f3194b78a31eccf6eadb87923a5cbb9d91d774bf72e429c457df3",
    "suites": [
      "tests/mechanicalBatch7.test.cjs"
    ]
  },
  "70368879": {
    "fingerprint": "9cb54bb0bec474c34f79c8ca9226a0e6319f96e9a1e25f4683c28616b3633677",
    "suites": [
      "tests/classicExpansionFamilies.test.cjs"
    ]
  },
  "70781052": {
    "fingerprint": "b74f5f4faa924a2ec060df335fd5f78225c61452bb45149be32d7e4cf294de09",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "72892473": {
    "fingerprint": "34cffc49c6367b1000b809826852cf54d20de10bbbcde1268c6088149c0cd896",
    "suites": [
      "tests/classicEngine.test.cjs",
      "tests/classicPersistentReview.test.cjs"
    ]
  },
  "73134081": {
    "fingerprint": "1e67f07c3190fb1506f06e2bc5ecf145447c5279d2cd8c03e7e21044f5ef0b32",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "73481154": {
    "fingerprint": "75e15451fafb7ab489972563b1b1ddbe635a1804925bbec1640d9491bf842c20",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "74677422": {
    "fingerprint": "11f420a21069f9a69e66c73dc11ee77a31e3e1dfa2c5398c24d64ea98160f2f5",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "75356564": {
    "fingerprint": "8888ca482fab66e2a8c87cccf880b719b362359b17854f57d789e1926d973caa",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "75499502": {
    "fingerprint": "3f7f204873a3ef26849df8fd87d0628f7028eb95093ed2c31fdf006e5d055a8d",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "75850803": {
    "fingerprint": "36b47f2a8f611d6200ee886da61f78a60adcb50269626391927b8b30700e38c3",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "75889523": {
    "fingerprint": "fd3dee7c758f44468eccc8d337725fca2eec30a4401f739a0e3cbec7e9d2d61e",
    "suites": [
      "tests/historicalNormalCertification.test.cjs"
    ]
  },
  "76103675": {
    "fingerprint": "512bd04ea7b46cc062c37fdcd37b4f0cd624739c4813bac9683e1bb415b33680",
    "suites": [
      "tests/classicExpansionFamilies.test.cjs"
    ]
  },
  "76184692": {
    "fingerprint": "ab45fbfda67ddcf24256635a12bb4274f6682a117098b85bf08672a11a69f16e",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "76704943": {
    "fingerprint": "ebf6a8e0ba3bb3edc1e868ba93ace766a4117f1cfa4dd3a2d18901638b847d41",
    "suites": [
      "tests/historicalNormalBatch4.test.cjs"
    ]
  },
  "77414722": {
    "fingerprint": "b40eb3632607415d35fc6f63a9d22483867d94fdb17c09186fcf3d8601a83d9b",
    "suites": [
      "tests/classicCounterTraps.test.cjs",
      "tests/classicTargetReview.test.cjs"
    ]
  },
  "77491079": {
    "fingerprint": "59796871f1e2c41af853b34636bcada9663ab3881744fc30a5e7532372321bc5",
    "suites": [
      "tests/mechanicalBatch7.test.cjs"
    ]
  },
  "77585513": {
    "fingerprint": "76f789c4050505220a983dddd38a8c7ff9ad72e2734491530b10216b4c2e8b2b",
    "suites": [
      "tests/classicContinuousEffects.test.cjs",
      "tests/engineRefactor.test.cjs"
    ]
  },
  "77603950": {
    "fingerprint": "7c6d687881af9098ea4a3043a749011a82868361b3e179200d3aadc53de9c4ea",
    "suites": [
      "tests/historicalNormalBatch4.test.cjs"
    ]
  },
  "78010363": {
    "fingerprint": "d4ad8a4c8693bddadcc79fc182f6ba9fcce94290a8b3cddf48555d733e43be19",
    "suites": [
      "tests/classicGraveTriggers.test.cjs",
      "tests/engineRefactor.test.cjs"
    ]
  },
  "80770678": {
    "fingerprint": "25248c6e5032055407206c281eb632b8d55851aec40d28b60df1931783c64dd3",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "81057959": {
    "fingerprint": "25a981114f391b3793ad828a56b2787501c9473da14f6ff5cfe990c2dc836162",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "83011277": {
    "fingerprint": "f8b998d23994e7c1017cfa68b728e2b4f15a8ea279234729682f6408cc47d88b",
    "suites": [
      "tests/classicBattleRecruiters.test.cjs",
      "tests/engineRefactor.test.cjs"
    ]
  },
  "83678433": {
    "fingerprint": "dd75abee783e4a139ec10660bf1e141f2adff6a19b9cf2453f2067f08b99050d",
    "suites": [
      "tests/historicalNormalBatch4.test.cjs"
    ]
  },
  "83764718": {
    "fingerprint": "c2e38ab4134ee2434e1da2a755c60e69710cb5ab5d46f4ceeb0d56b6875db0a0",
    "suites": [
      "tests/classicEngine.test.cjs"
    ]
  },
  "83968380": {
    "fingerprint": "50cf27da92c0898c476f630ae027013b6b0fbe07f316f745e5856642fdc1be05",
    "suites": [
      "tests/classicExpansionFamilies.test.cjs"
    ]
  },
  "83994646": {
    "fingerprint": "1a08f1bee854092d0abccfbdbdfdfe376e4558baff5572324102100c78f14888",
    "suites": [
      "tests/mechanicalBatch7.test.cjs"
    ]
  },
  "84257639": {
    "fingerprint": "64ef363bf8100b70b55115aadd69dc9be474e47962ed84e0a2a00c5bbdf0f939",
    "suites": [
      "tests/classicEngine.test.cjs"
    ]
  },
  "84285623": {
    "fingerprint": "e5af2b718ca1b3488cf9bf313edb745e6c5294b31b7f5c92454b4c29e7833376",
    "suites": [
      "tests/historicalNormalCertification.test.cjs"
    ]
  },
  "84834865": {
    "fingerprint": "7ea81906abee8111a13e8d9a51d42e521f7db546ef51fe061b4f7f9762332b95",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "85705804": {
    "fingerprint": "12af9903982ed165a49ab4e7d2f7122d1724a438b5bad63a0eccf783455cbc7f",
    "suites": [
      "tests/historicalNormalBatch4.test.cjs"
    ]
  },
  "86318356": {
    "fingerprint": "d8bc328ac0c0b62a69b62cefa16067df5a20d17a8f7ee5f8919dc92567937c39",
    "suites": [
      "tests/classicEngine.test.cjs",
      "tests/classicCardReview.test.cjs",
      "tests/classicPersistentReview.test.cjs"
    ]
  },
  "86325596": {
    "fingerprint": "668c54444b86af1a32d19ec636ece100b7ab944c2ca824351e5840ee0d49efe1",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "87430998": {
    "fingerprint": "5b7b623889999855f8f4c3fdde925110ba36ff56efce764da4a3d9891e742eec",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "87796900": {
    "fingerprint": "b0a0c8c1d7dbaef43d9a168dd40bf9817cee5e4cf4228267d1f79073c9d7ec11",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "88435542": {
    "fingerprint": "6286709ffe9927c7ab75875b63c0d20df4af7b069e608ae944041c1576083d4c",
    "suites": [
      "tests/historicalNormalBatch4.test.cjs"
    ]
  },
  "88819587": {
    "fingerprint": "13417f59dd8e0b0c609aeda7a206d2b4e1baeb128b3dbd7433f9cd7b6b1b1bd3",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "89494469": {
    "fingerprint": "cf1ca553c1319dbd3b13d9eefd6a0cb2e434e4083958c3f5e7cb6ddd715fdd25",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "89631139": {
    "fingerprint": "424f74a723418cfbfb0439940fdf76921e1d712b2d3a7866f5c64e699b2b397b",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "90357090": {
    "fingerprint": "0325634d894f4eb4fc875c568d6fbaa3581e121c01142d27c36c2b4c016382bc",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "90963488": {
    "fingerprint": "8bd561dfdc25f9b12f1b4f590867462023f104e0c839a175d0dc647ed70c0f48",
    "suites": [
      "tests/historicalNormalCertification.test.cjs"
    ]
  },
  "91152256": {
    "fingerprint": "d7ac6e71e2c64b5bb2ca7485872bc9c95acf18cf707edbcdc7d741718b8c3ec8",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "91595718": {
    "fingerprint": "b601e84d2f22953d16573b1d3c7cec64d49accb295b6adfa6aefbfe38800bebb",
    "suites": [
      "tests/classicEngine.test.cjs",
      "tests/classicPersistentReview.test.cjs"
    ]
  },
  "91869203": {
    "fingerprint": "c755d733ae29ea519bd519ba0f54ebba92146f159bd1315885f703f34d55869e",
    "suites": [
      "tests/mechanicalBatch7.test.cjs"
    ]
  },
  "91939608": {
    "fingerprint": "74ddbcb41acaa861a9fc4e0db892921a71ed59296d45ac8aed8a8064a8f42635",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "93221206": {
    "fingerprint": "ecfd0b88d66457c7e027a9e8ee79b8042f9d0972a8b5df57075176d1869b6203",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "95956346": {
    "fingerprint": "16703b4a3261548d7d5a23efb0979938d796d3056a255563e0810f96bb854055",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "97017120": {
    "fingerprint": "40b674a6174e3dc3f5c028d6bf1d3914d7d73fdaaa07079c0c8c5131a6f1fc2f",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "97360116": {
    "fingerprint": "970ca209d4157be42affac7a428f0ae28f919d4d18656ac641ddf60dd5d71c29",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "97590747": {
    "fingerprint": "31c78584759c4650a04d7c33a8e9d820d48777cbd7664f11ee388c67eee429db",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "97973387": {
    "fingerprint": "713b2472268bfb63c51a394fd642ad23f65c92eb07a5b7b1bdb2648117a13149",
    "suites": [
      "tests/historicalNormalBatch4.test.cjs"
    ]
  },
  "98049915": {
    "fingerprint": "cadf7249880046f6ba1558936fdc940326f3159fcd899610fb339e1719a293a4",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "98252586": {
    "fingerprint": "b67ac192c403e4284dc4236664e7f4c0f267499eb20d556daf1d56be2ee449c8",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "98374133": {
    "fingerprint": "3d5a00d47c53c42380a7541649c12daaf65975b189ea76b282ed4152defca251",
    "suites": [
      "tests/classicEngine.test.cjs",
      "tests/classicPersistentReview.test.cjs"
    ]
  },
  "99030164": {
    "fingerprint": "0e11f20cd2a336635b66b98b733e6449975412ee44a47ba938bcfb3c9bb85c0c",
    "suites": [
      "tests/historicalNormalBatch4.test.cjs"
    ]
  },
  "07089711": {
    "fingerprint": "d6d05f8b69c83200362ce785134e4533f28f93b0f7578be9fa1d48712f1646d2",
    "suites": [
      "tests/classicFlipEffects.test.cjs",
      "tests/engineRefactor.test.cjs"
    ]
  },
  "03819470": {
    "fingerprint": "7f46aa36ec0cc795d3b9a77b48ab57d2c5982afb1ef2fd3677d247f48adc20b4",
    "suites": [
      "tests/classicCounterTraps.test.cjs",
      "tests/classicTargetReview.test.cjs"
    ]
  },
  "05318639": {
    "fingerprint": "269697e799f0d073ae6181fe460c12f25dfcd797b48adca707f7ce26ac22dce8",
    "suites": [
      "tests/classicEngine.test.cjs",
      "tests/classicCardReview.test.cjs",
      "tests/classicTargetReview.test.cjs"
    ]
  },
  "04031928": {
    "fingerprint": "1563fb8a12859b06130ef04d5adee049e20dcc429ad9b9c036b27ead7ab4dce2",
    "suites": [
      "tests/classicEngine.test.cjs"
    ]
  },
  "04206964": {
    "fingerprint": "514a0ed16d1564dade7b75a288f58773f3ec1f4e28576610f336c777def8d6b9",
    "suites": [
      "tests/classicSummonResponses.test.cjs"
    ]
  },
  "04614116": {
    "fingerprint": "0a5b822e1461ff59445c6b8a62c8dcb86e288ac9df3a2ce5f0c0665009096753",
    "suites": [
      "tests/classicEngine.test.cjs",
      "tests/classicPersistentReview.test.cjs"
    ]
  },
  "01435851": {
    "fingerprint": "2a37131e50b1ba4af8510b3ed231553f36d94d0a46f05fd5ec8ff77357c0693d",
    "suites": [
      "tests/classicEngine.test.cjs",
      "tests/classicPersistentReview.test.cjs"
    ]
  },
  "00756652": {
    "fingerprint": "f58f73f4522d57ce1441a27fa6f2e522bb1d8582bc10224a00fba3bc0a0b5e5f",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "03573512": {
    "fingerprint": "16bd9acc342f9452f9880b416f1f6381464d24ca0b1844bf60c45493c96060f7",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "05053103": {
    "fingerprint": "9f32af48041e3f395cd9b920e64fabda4cfaa86964476268ff1a0d8fc8ec794c",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "06368038": {
    "fingerprint": "985b6bc6010a3faee75c1a2c0bc55d26776cf2c93315d851aef85cd4e85293cd",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "01184620": {
    "fingerprint": "975287043a5be6c07cce6d178366c865c8699861a76131fe0b0f50cb42c3b924",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "01784619": {
    "fingerprint": "a892593886ceb3171e11fb92d9c7bd0d135fe7608533b152b4327400ead3f6bc",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "04042268": {
    "fingerprint": "97a51c05cbeaea6db6f129611dfbba717a7e241598f8b4d6851dc06f03b6d911",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "05388481": {
    "fingerprint": "55a156b0fbae57d09e7849b831b255cf52e37c886ee64721ab5137984e0cfe98",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "08783685": {
    "fingerprint": "34e1428d68b519a31ad75dcf3490fead71b0cc71b90a289532a9d984dcf455ec",
    "suites": [
      "tests/historicalNormalCertification.test.cjs"
    ]
  },
  "09159938": {
    "fingerprint": "91704d9a44a98e38f663c1fffe284bc7a406161d2b9ffef2de044dbfcba00c9d",
    "suites": [
      "tests/historicalNormalCertification.test.cjs"
    ]
  },
  "09430387": {
    "fingerprint": "d825ae061c8f0c9ddcf133558e31c1a3c2eb6c1f9bbef8498242c61d6a81e7b1",
    "suites": [
      "tests/historicalNormalCertification.test.cjs"
    ]
  },
  "08944575": {
    "fingerprint": "303254399d542d5d0f1b1bd28ff869a585ef582f46dde10a471ca260e504f0c8",
    "suites": [
      "tests/historicalNormalBatch4.test.cjs"
    ]
  },
  "03985011": {
    "fingerprint": "977a334b0a843ce96e8777e6c92428cc9e175c63e0d9ad0f5c0827ffb1643c39",
    "suites": [
      "tests/historicalNormalBatch4.test.cjs"
    ]
  },
  "03732747": {
    "fingerprint": "49b2f511db4d9f0632daa78311f2556df72cf45a950ae06135a8d988398136b9",
    "suites": [
      "tests/historicalNormalBatch4.test.cjs"
    ]
  },
  "05901497": {
    "fingerprint": "02fa064f8b6d0d948dec8beede32c6ea798eae4cb378d44525e557e236ec62d0",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "02370081": {
    "fingerprint": "dfeb22b82a650da91f0423f66331afcc32b4b6978c5c9bca88dd755e3462ed28",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  }
,"16430187":{"fingerprint":"932c2c8031387be489c109aadd32dbf157373caef7652523fc82f92f8b2223ad","suites":["tests/mechanicalBatch8.test.cjs"]},"18161786":{"fingerprint":"fd8156d5c2ffb8bc9e904a0fa06c767c7bd21aef20070abe46edd8fd771fdf72","suites":["tests/mechanicalBatch8.test.cjs"]},"19384334":{"fingerprint":"2d80a194417629be44cccc971be7725c1d776c6c9ba2a07586f2c9716d7ae3e5","suites":["tests/mechanicalBatch8.test.cjs"]},"20065549":{"fingerprint":"329526b0976ba7eed5d1e3db5db4e700d0d6780535da7e17d71e426bb8b2cfd8","suites":["tests/mechanicalBatch8.test.cjs"]},"28470714":{"fingerprint":"66fc62dee429889c6f3b1bd2b79416dca53b5a285088d8b3e258ed6a841cbc63","suites":["tests/mechanicalBatch8.test.cjs"]},"30778711":{"fingerprint":"2b57bd998544bea374c155d3de53424c1d9574182782372c13e35faaaa1cc92a","suites":["tests/mechanicalBatch8.test.cjs"]},"45778932":{"fingerprint":"f3c6a43d0d1cc731233e137cab57275777fb7c9697d10b8e3051240dbb55b906","suites":["tests/mechanicalBatch8.test.cjs"]},"46657337":{"fingerprint":"2f9f4d4012e7a344f9444c1666fb487737d8f091727ca219f0ef18c02f1250c9","suites":["tests/mechanicalBatch8.test.cjs"]},"56594520":{"fingerprint":"32f438697ea66842e3e9bdea4eafdf6d4d1b57b7f066e1993fa8629d0125cbb4","suites":["tests/mechanicalBatch8.test.cjs"]},"56747793":{"fingerprint":"2647b701432276d064f0cd79dd1e7f02afcdb05cec42c44d13647fef67c260d0","suites":["tests/mechanicalBatch8.test.cjs"]},"67629977":{"fingerprint":"407bfdba47b6675e509aac63c9365f00e376ac34baf348f4de91e5074361897d","suites":["tests/mechanicalBatch8.test.cjs"]},"68658728":{"fingerprint":"b9750c186332f6b46136a145a1a8c9e3747f519135115d65a789028cd3976276","suites":["tests/mechanicalBatch8.test.cjs"]},"70046172":{"fingerprint":"8b9ee43b24a9c5d72f077bb14fb2a90336006c73e9a4676ee43a867dcc3f330f","suites":["tests/mechanicalBatch8.test.cjs"]},"80741828":{"fingerprint":"b8f7f0ac8669d40eaaaee7ff1d99a1d99e21277c7de1f252fad1ea4699993436","suites":["tests/mechanicalBatch8.test.cjs"]},"81777047":{"fingerprint":"097d704cace55364cd8824187a4159cf4b48390cabe71ad200343057d0ea7826","suites":["tests/mechanicalBatch8.test.cjs"]},"82732705":{"fingerprint":"736d62c31bc10fc520573ab11d6ba26717b21e4c6b1c5b92ae941de725ab89d4","suites":["tests/mechanicalBatch8.test.cjs"]},"82999629":{"fingerprint":"8c22edb79b83b4c6ce9041efab7d29da2c604e2c2eecc64609f28272491ac007","suites":["tests/mechanicalBatch8.test.cjs"]},"83746708":{"fingerprint":"73ffd8d20f18bec1990cc71250809a53dff1a7337c92757b241973e8bf32514d","suites":["tests/mechanicalBatch8.test.cjs"]},"91862578":{"fingerprint":"c0a541b6480de3208c7c11ef854e8237781c1b4603de85a6dc7f7d53aecfa32f","suites":["tests/mechanicalBatch8.test.cjs"]},"07489323":{"fingerprint":"a54842a3a0e3d5f082fb4b6870201ceb7da0893211e71bb3bb02ed950459530f","suites":["tests/mechanicalBatch8.test.cjs"]},"08201910":{"fingerprint":"11ff92a95964e5ddc19995f823f5a2d8766132ee4fe7803fd3e9a8c4f7738b06","suites":["tests/mechanicalBatch8.test.cjs"]},"00403847":{"fingerprint":"883e15673cfcd19b4ce670f439b47879625fa6e95e288e1be29ba44a5d540dd1","suites":["tests/mechanicalBatch8.test.cjs"]}
,"16507828":{"fingerprint":"5e98d7bfafda2860681ebbb232fb4b59c109690c877896cc650cfdbf611ebee2","suites":["tests/fusionBatch8.test.cjs"]},"17881964":{"fingerprint":"6a35869312f93e87bb45a2d522ce7e59d054d9dc44035307ad0a245a9ee725c6","suites":["tests/fusionBatch8.test.cjs"]},"20315854":{"fingerprint":"35c388adfa639cac8900d03d9152b6aeade28ae999b3bc2d912c8ec95202a41b","suites":["tests/fusionBatch8.test.cjs"]},"32274490":{"fingerprint":"2bc9ea35366cd7bd5d94dc826f9d1cfe66040a5d9d4201b4b41476a22b053039","suites":["tests/fusionBatch8.test.cjs"]},"32751480":{"fingerprint":"857f90c150550ae4b2d421bff4f09b6da1e396723f308afc5ac05b5bee142a19","suites":["tests/fusionBatch8.test.cjs"]},"33691040":{"fingerprint":"b03d8084943953c833f87cb48a4fd77195df6f826f15b4d24838bd6f929bb4a8","suites":["tests/fusionBatch8.test.cjs"]},"38289717":{"fingerprint":"30cd9d64d47036b65dfebf48ba6e7fd2a91f0debe2b973b2803567c7e5116a11","suites":["tests/fusionBatch8.test.cjs"]},"40826495":{"fingerprint":"fd3ea52e217013c01885a4f6664ecf86d18978069f449d80fb5006ec76b38768","suites":["tests/fusionBatch8.test.cjs"]},"42348802":{"fingerprint":"57d2206c37950d409c5f4bee4b2607226a741ed47685e62f9bba354c2498f748","suites":["tests/fusionBatch8.test.cjs"]},"43500484":{"fingerprint":"4337f474121a75a21facbcff98447d1d87cb1e7f8b4fa706ec6da32512951fbf","suites":["tests/fusionBatch8.test.cjs"]},"58528964":{"fingerprint":"cdcb9a5d66a49d884601bc9ca08f348916785e10a5d68f02e92b410baffd2640","suites":["tests/fusionBatch8.test.cjs"]},"83464209":{"fingerprint":"bb2419d33c7149294e28b60d5fbe773ce47effa3b5edd7f819aa944c51aebf7b","suites":["tests/fusionBatch8.test.cjs"]},"94119974":{"fingerprint":"ebe31f2d9557504ec17d00e2261f19864963343ec4fbbb67e582d38c3390226d","suites":["tests/fusionBatch8.test.cjs"]},"94566432":{"fingerprint":"a92099eb5ce4e6a6c76b3e6eb212a66c2bfaa9b99e9b006c4c4633d5b00f8d01","suites":["tests/fusionBatch8.test.cjs"]},"94905343":{"fingerprint":"58aa1fda5470eefc1d8eb68fb5f99da006a0586982f8c96bfb02a5bc3ce5e23c","suites":["tests/fusionBatch8.test.cjs"]},"95952802":{"fingerprint":"d48d71920b20445471e84049be45e09c3d9076bb46e225425c81919d03c65b84","suites":["tests/fusionBatch8.test.cjs"]},"02830619":{"fingerprint":"1613a0678f91a50b6405453c018103046003325746509bfd7c07efd4a2202786","suites":["tests/fusionBatch8.test.cjs"]},"01641882":{"fingerprint":"36c66b304a76d14c8067364f9b96000135a76d611c0142bd97f0dba788fc9e46","suites":["tests/fusionBatch8.test.cjs"]}
};
