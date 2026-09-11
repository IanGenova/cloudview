import assert from 'node:assert/strict';
import test from 'node:test';

import {
  imageTitleFromFileName,
  isMachineGeneratedImageName,
  presentableImageTitle,
} from './guide-image-title';

/*
 * What a gallery photo is called when nobody named it.
 *
 * The dashboard upload used the file's name as the photo's title, with the
 * hyphens turned into spaces. Phones and downloads name files things like
 * "d885ab12-d9f0-43c2-9976-02eddeebb8db.jpg" and "IMG_20260911_101512.jpg",
 * so the live Facilities page showed a guest, in serif type over a hotel
 * photograph, the caption "d885ab12 d9f0 43c2 9976 02eddeebb8db". Three of the
 * three photos on the live site carried a title like that.
 *
 * A file name is a title only when it reads like one. Otherwise the photo has
 * no title, and the screen shows nothing rather than a machine's bookkeeping.
 */

test('a UUID file name is not a title, however the separators are written', () => {
  for (const name of [
    'd885ab12-d9f0-43c2-9976-02eddeebb8db.jpg',
    'd885ab12_d9f0_43c2_9976_02eddeebb8db.webp',
    'D885AB12-D9F0-43C2-9976-02EDDEEBB8DB.PNG',
    'd885ab12d9f043c2997602eddeebb8db.jpg',
  ]) {
    assert.equal(isMachineGeneratedImageName(name), true, name);
    assert.equal(imageTitleFromFileName(name), '', name);
  }
});

test('camera, phone and screenshot names are not titles', () => {
  for (const name of [
    'IMG_20260911_101512.jpg',
    'IMG-4521.JPG',
    'DSC_0001.jpg',
    'DSCF1234.jpg',
    'PXL_20260911_021512345.jpg',
    'Screenshot 2026-09-11 at 10.15.12.png',
    'Screenshot_20260911-101512.png',
    'WhatsApp Image 2026-09-11 at 10.15.12.jpeg',
    'image (3).png',
    'image.png',
    'photo.jpg',
    'download (2).jpg',
    'unnamed.jpg',
    'untitled-1.png',
    '20260911_101512.jpg',
    '1757556912345.jpg',
    'a1b2c3d4e5f6a7b8c9d0.jpg',
  ]) {
    assert.equal(isMachineGeneratedImageName(name), true, name);
    assert.equal(imageTitleFromFileName(name), '', name);
  }
});

test('a name a person wrote becomes a readable title', () => {
  assert.equal(imageTitleFromFileName('pool-deck-sunset.jpg'), 'Pool deck sunset');
  assert.equal(imageTitleFromFileName('Infinity_Pool_View.JPG'), 'Infinity Pool View');
  assert.equal(imageTitleFromFileName('  lobby  lounge .png'), 'Lobby lounge');
  assert.equal(imageTitleFromFileName('Spa & Wellness Centre.webp'), 'Spa & Wellness Centre');
  assert.equal(imageTitleFromFileName('Room 305 balcony.jpg'), 'Room 305 balcony');
});

test('a title is at most 120 characters', () => {
  assert.equal(imageTitleFromFileName(`${'sunset '.repeat(40)}.jpg`).length, 120);
});

/*
 * Rows already saved with a machine name as their title -- the three on the
 * live site -- are shown as untitled without touching the database.
 */
test('a stored machine-name title presents as nothing', () => {
  assert.equal(presentableImageTitle('d885ab12 d9f0 43c2 9976 02eddeebb8db'), '');
  assert.equal(presentableImageTitle('IMG 20260911 101512'), '');
  assert.equal(presentableImageTitle(null), '');
  assert.equal(presentableImageTitle('   '), '');
});

test('a real stored title presents as itself', () => {
  assert.equal(presentableImageTitle('Pool bar at sunset'), 'Pool bar at sunset');
  assert.equal(presentableImageTitle('  Lobby  '), 'Lobby');
  assert.equal(presentableImageTitle('Gallery Image 2'), 'Gallery Image 2');
});
